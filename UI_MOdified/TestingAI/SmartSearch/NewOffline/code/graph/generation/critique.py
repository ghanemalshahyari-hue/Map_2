"""graph/generation/critique.py — faithfulness pass + narrow re-draft.

Two LLM calls at most, per scoping §6.2 step 7 and §7.2:

    1.  Critique the draft — for each field, verdict
        ``{supported: bool, suggested_fix: str | None}``.
    2.  Re-draft ONLY unsupported fields. The second call sees the
        draft, the chunks, AND the critique's ``suggested_fix`` per
        field so it can produce a replacement that addresses the
        specific weakness.

The two-pass shape is what keeps Phase 3 to 8–12 LLM calls per full
4-document run. A full re-draft on any failure would double the
cost of every group without a meaningful accuracy gain; a narrow
re-draft keeps passing fields untouched.

The critique model defaults to ``temperature=0.0`` (determinism);
the re-draft model reuses the draft config (``temperature=0.2`` by
default).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, create_model

from graph.generation.evidence import EvidenceBundle, build_evidence_bundle
from graph.generation.llm import (
    DEFAULT_CRITIQUE_MODEL,
    DEFAULT_DRAFT_MODEL,
    critique_config,
    draft_config,
)
from graph.generation.retrieval_group import GroupRetrievalResult
from graph.shared.responses_client import (
    ResponsesInvocationError,
    invoke_structured,
)

__all__ = [
    "FieldVerdict",
    "CritiqueResult",
    "critique_and_repair",
]


def _bundle_is_tiered(evidence: EvidenceBundle) -> bool:
    return bool(evidence.source_files_evidence) or bool(evidence.doctrine_evidence)


class FieldVerdict(BaseModel):
    model_config = ConfigDict(extra="forbid")
    field_name: str
    supported: bool
    suggested_fix: str | None = None


class CritiqueResult(BaseModel):
    model_config = ConfigDict(extra="forbid")
    verdicts: list[FieldVerdict]


# --------------------------------------------------------------- critique prompt

# Legacy critique prompt — used when the bundle has only the
# operationalfiles channel populated. Byte-equal to the pre-§C30
# prompt so drafter behaviour stays identical for legacy templates.
_CRITIQUE_SYSTEM_AR = (
    "أنت مراجع عقيدي دقيق. مهمتك فحص كل حقل من المسودَّة التالية وتحديد ما "
    "إذا كان مدعوماً بشكل مباشر بالمقاطع المقدَّمة في [المصادر]. "
    'أرجع كائن JSON واحداً بالشكل التالي حصراً: '
    '{"verdicts": [ {"field_name": "...", "supported": true|false, "suggested_fix": "..." | null}, ... ]}. '
    'مفتاح المصفوفة يجب أن يكون "verdicts" بالضبط — لا "critique_results" ولا أي اسم آخر. '
    "القواعد:\n"
    "- supported=true يعني المقاطع المذكورة تدعم النص بشكل مباشر. إعادة الصياغة "
    "مقبولة؛ الاختراع أو التعميم غير مدعومَين.\n"
    '- إذا كانت قيمة الحقل هي "غير متوفر في العقيدة المتاحة"، اعتبرها '
    "supported=true دون اقتراح.\n"
    "- عند supported=false، اكتب في suggested_fix جملةً قصيرة بالعربية تحدِّد "
    "أي جزء من الحقل غير مدعوم وماذا يُستبدل به من المقاطع.\n"
    "- فحص وسوم الاستشهاد ليس من مهمتك — الجملة تُعدُّ مدعومة إذا كان "
    "المعنى متطابقاً مع مقطع حتى لو غاب الوسم أو كان في مكان غير دقيق.\n"
    "- راجع كل حقل باستقلال. لا تعمم حكماً من حقل إلى آخر."
)


# Tier-aware critique prompt — fires only when the bundle has a
# source_files OR doctrine channel populated. Adds the typed-evidence
# faithfulness rule locked in tiered_retrieval_discussion.md:
# mission-specific entities require source_files OR operationalfiles
# support; doctrine alone does NOT validate scenario facts.
_CRITIQUE_SYSTEM_TIERED_AR = (
    "أنت مراجع عقيدي دقيق. مهمتك فحص كل حقل من المسودَّة التالية وتحديد ما "
    "إذا كان مدعوماً بشكل مباشر بإحدى قنوات الأدلة المصنَّفة الواردة في "
    "السياق ([FACTS FROM UPLOADED SOURCE FILES] / [OPERATIONAL FILES] / "
    "[DOCTRINE REFERENCE LIBRARY]).\n\n"
    'أرجع كائن JSON واحداً بالشكل التالي حصراً: '
    '{"verdicts": [ {"field_name": "...", "supported": true|false, "suggested_fix": "..." | null}, ... ]}. '
    'مفتاح المصفوفة يجب أن يكون "verdicts" بالضبط — لا "critique_results" ولا أي اسم آخر.\n\n'
    "قواعد الأدلة المصنَّفة (إلزامية):\n"
    "- ادَّع نوع الجملة أولاً: هل هي حقيقة خاصة بالعملية (وحدة، مكان، وقت، "
    "اسم خاص، معرِّف، أي معطًى مرتبط بالسيناريو) أم تأطير عقيدي (تعريف، "
    "معيار، إجراء، مبدأ)؟\n"
    "- الحقائق الخاصة بالعملية تُعدُّ supported=true فقط إذا أُسندت إلى "
    "[FACTS FROM UPLOADED SOURCE FILES] أو [OPERATIONAL FILES]. "
    "[DOCTRINE REFERENCE LIBRARY] وحدها لا تكفي — اعتبر هذه الحالة "
    "supported=false.\n"
    "- التأطير العقيدي يُعدُّ supported=true إذا أُسند إلى "
    "[DOCTRINE REFERENCE LIBRARY] أو [OPERATIONAL FILES].\n"
    "- جملة بلا أي وسم استشهاد بين قوسين مربَّعين تُعدُّ supported=false.\n\n"
    "قواعد عامة:\n"
    "- supported=true يعني المقاطع المذكورة تدعم النص بشكل مباشر. إعادة الصياغة "
    "مقبولة؛ الاختراع أو التعميم غير مدعومَين.\n"
    '- إذا كانت قيمة الحقل هي "غير متوفر في العقيدة المتاحة"، اعتبرها '
    "supported=true دون اقتراح.\n"
    "- عند supported=false، اكتب في suggested_fix جملةً قصيرة بالعربية تحدِّد "
    "أي جزء من الحقل غير مدعوم وأي قناة من القنوات الثلاث يجب أن يستند إليها.\n"
    "- راجع كل حقل باستقلال. لا تعمم حكماً من حقل إلى آخر."
)


def _render_sourced_hits(hits: tuple[Any, ...]) -> str:
    blocks: list[str] = []
    for sh in hits:
        text = sh.hit.text.strip().replace("\r\n", "\n")
        blocks.append(f"{sh.citation_tag}  {text}")
    return "\n\n".join(blocks)


def _render_fact_snippets(snippets: tuple[Any, ...]) -> str:
    blocks: list[str] = []
    for snip in snippets:
        kind = snip.source_file_kind or snip.field_name
        tag = f"[S: {kind} §extracted]"
        text = snip.text.strip().replace("\r\n", "\n")
        blocks.append(f"{tag}  - {snip.field_name}: {text}")
    return "\n\n".join(blocks)


def _format_evidence(evidence: EvidenceBundle) -> str:
    """Render the bundle's three channels for the critique prompt.

    Mirrors :func:`graph.generation.section_drafter._format_evidence`
    so the critique sees evidence in exactly the same shape the
    drafter saw — no heuristic mismatch between the two passes.

    Legacy bundles (operationalfiles-only) emit chunks without a
    header, byte-equal to the pre-§C30 ``_format_chunks(retrieval)``
    output. Tier-aware bundles emit one labelled block per non-empty
    channel.
    """
    of = evidence.operationalfiles_evidence
    sf = evidence.source_files_evidence
    doc = evidence.doctrine_evidence

    if not _bundle_is_tiered(evidence):
        return _render_sourced_hits(of)

    sections: list[str] = []
    if sf:
        sections.append(
            "[FACTS FROM UPLOADED SOURCE FILES]\n" + _render_fact_snippets(sf)
        )
    if of:
        sections.append("[OPERATIONAL FILES]\n" + _render_sourced_hits(of))
    if doc:
        sections.append("[DOCTRINE REFERENCE LIBRARY]\n" + _render_sourced_hits(doc))
    return "\n\n".join(sections)


def _format_draft(field_values: dict[str, str]) -> str:
    blocks: list[str] = []
    for fname, value in field_values.items():
        blocks.append(f"### {fname}\n{value}")
    return "\n\n".join(blocks)


# --------------------------------------------------------------- re-draft prompt

_REDRAFT_SYSTEM_AR = (
    "أعد كتابة الحقول المذكورة فقط بحيث تصبح مدعومة بشكل مباشر بالمقاطع "
    "المقدَّمة، مع الالتزام بالوسوم الواردة بجانب المقاطع حرفياً. لا تعدل "
    "أي حقل ليس في قائمة الإصلاحات. قواعد العربية والاستشهاد هي نفسها الواردة "
    "في استدعاء الصياغة الأصلي. إن كانت المقاطع لا تدعم الحقل، اكتب فيه: "
    '"غير متوفر في العقيدة المتاحة".'
)


def _build_redraft_model(redraft_field_names: tuple[str, ...]) -> type[BaseModel]:
    fields: dict[str, Any] = {
        fname: (str, Field(description=f"Re-drafted Arabic value for {fname!r}"))
        for fname in redraft_field_names
    }
    cfg = ConfigDict(extra="forbid")
    return create_model("Redraft_subset", __config__=cfg, **fields)  # type: ignore[return-value]


# --------------------------------------------------------------- entry point

@dataclass(frozen=True)
class CritiqueOutcome:
    """Summary from :func:`critique_and_repair` for logging / debug.

    ``final_values`` is what the assembler should use — original
    drafts for supported fields, repaired strings for unsupported
    ones. ``verdicts`` is the critique pass's raw output (kept for
    transparency).
    """

    final_values: dict[str, str]
    verdicts: tuple[FieldVerdict, ...]
    redrafted_field_names: tuple[str, ...]


def critique_and_repair(
    retrieval: GroupRetrievalResult,
    draft_field_values: dict[str, str],
    *,
    evidence: EvidenceBundle | None = None,
) -> CritiqueOutcome:
    """Run the critique pass and (if needed) one re-draft call.

    Returns the final per-field values plus the critique's verdict
    list. Never raises on an unsupported field — it just re-drafts.

    ``evidence`` (added in tiered-retrieval Phases 3+4 — §C30) carries
    the three labelled evidence channels — source_files / operationalfiles
    / doctrine. When ``None``, the critique builds a legacy
    operationalfiles-only bundle from ``retrieval`` so existing call
    sites keep working unchanged. The system prompt + chunks block
    fall back to the pre-§C30 byte-equal shape when the bundle is
    operationalfiles-only.
    """
    if evidence is None:
        evidence = build_evidence_bundle(group_result=retrieval)

    if not retrieval.hits and not evidence.source_files_evidence:
        # No evidence at all — nothing meaningful to critique.
        return CritiqueOutcome(
            final_values=dict(draft_field_values),
            verdicts=tuple(
                FieldVerdict(field_name=f, supported=True, suggested_fix=None)
                for f in draft_field_values
            ),
            redrafted_field_names=(),
        )

    chunks = _format_evidence(evidence)
    draft_text = _format_draft(draft_field_values)
    critique_system = (
        _CRITIQUE_SYSTEM_TIERED_AR
        if _bundle_is_tiered(evidence)
        else _CRITIQUE_SYSTEM_AR
    )

    _, critique_temperature = critique_config()
    try:
        critique_result = invoke_structured(
            role_env="PHASE3_CRITIQUE_MODEL",
            default_model=DEFAULT_CRITIQUE_MODEL,
            temperature=critique_temperature,
            schema=CritiqueResult,
            system=critique_system,
            user=f"[المصادر]\n{chunks}\n\n[المسودَّة]\n{draft_text}",
            schema_name="critique_result",
        )
    except ResponsesInvocationError:
        # Critique failure is non-recoverable here — the caller expects
        # a CritiqueOutcome.  Surface the adapter's diagnostics unchanged.
        raise
    critique = critique_result.value
    assert isinstance(critique, CritiqueResult)

    unsupported = [v for v in critique.verdicts if not v.supported and v.field_name in draft_field_values]
    final_values = dict(draft_field_values)

    if not unsupported:
        return CritiqueOutcome(
            final_values=final_values,
            verdicts=tuple(critique.verdicts),
            redrafted_field_names=(),
        )

    redraft_names = tuple(v.field_name for v in unsupported)
    RedraftModel = _build_redraft_model(redraft_names)
    _, redraft_temperature = draft_config()

    fix_notes = "\n".join(
        f"### {v.field_name}\n- القيمة الحالية: {draft_field_values[v.field_name]}\n- "
        f"الإصلاح المقترح: {v.suggested_fix or '(لم يُقدَّم؛ اكتب نصاً مدعوماً مباشرةً)'}"
        for v in unsupported
    )
    user = (
        f"[المصادر]\n{chunks}\n\n"
        f"[الإصلاحات المطلوبة]\n{fix_notes}"
    )
    try:
        redraft_result = invoke_structured(
            role_env="PHASE3_DRAFT_MODEL",
            default_model=DEFAULT_DRAFT_MODEL,
            temperature=redraft_temperature,
            schema=RedraftModel,
            system=_REDRAFT_SYSTEM_AR,
            user=user,
            schema_name="redraft_subset",
        )
    except ResponsesInvocationError:
        # Re-draft failure is non-fatal at the document level: callers
        # treat the critique verdict list as authoritative and fall
        # back to the original drafts for unsupported fields.  Log the
        # diagnostics via the adapter and return the critique's view.
        return CritiqueOutcome(
            final_values=final_values,
            verdicts=tuple(critique.verdicts),
            redrafted_field_names=(),
        )
    redrafted = redraft_result.value
    assert isinstance(redrafted, BaseModel)
    for fname in redraft_names:
        repaired = getattr(redrafted, fname, None)
        if isinstance(repaired, str) and repaired.strip():
            final_values[fname] = repaired.strip()

    return CritiqueOutcome(
        final_values=final_values,
        verdicts=tuple(critique.verdicts),
        redrafted_field_names=redraft_names,
    )


# --------------------------------------------------------------- self-smoke

if __name__ == "__main__":
    # Structural smoke (no LLM, no Qdrant): verify the prompt selection
    # logic and the evidence formatter agree with section_drafter's
    # shape. The full behavioral acceptance (mission entity supported
    # only by doctrine → fails) requires the live critique LLM and
    # is exercised by the end-to-end gen.
    from types import SimpleNamespace

    from graph.generation.evidence import FactSnippet
    from graph.generation.retrieval_group import SourcedHit
    from graph.retrieval.schema import SearchHit

    hit_a = SourcedHit(
        hit=SearchHit(
            point_id="a", text="x", heading_path="", source_doc="FM-X",
            page_numbers=[1], chunk_type="body", chunk_index=0,
            paragraph_number="1-1", paragraph_numbers=["1-1"],
            cross_refs=[], rrf_score=0.0,
        ),
        collection="ingest__operationalfiles__bgem3",
        citation_tag="[FM-X §1-1]",
    )
    hit_d = SourcedHit(
        hit=SearchHit(
            point_id="d", text="y", heading_path="", source_doc="DOC-Y",
            page_numbers=[2], chunk_type="body", chunk_index=0,
            paragraph_number="2-2", paragraph_numbers=["2-2"],
            cross_refs=[], rrf_score=0.0,
        ),
        collection="ingest__doctrine__bgem3",
        citation_tag="[DOC-Y §2-2]",
        tier="doctrine",
    )

    legacy = build_evidence_bundle(
        group_result=SimpleNamespace(hits=(hit_a,)),  # type: ignore[arg-type]
    )
    legacy_text = _format_evidence(legacy)
    assert "[OPERATIONAL FILES]" not in legacy_text
    assert "[FM-X §1-1]" in legacy_text
    assert _bundle_is_tiered(legacy) is False
    print("OK legacy bundle: no header, legacy critique prompt selected")

    tiered = build_evidence_bundle(
        group_result=SimpleNamespace(hits=(hit_a, hit_d)),  # type: ignore[arg-type]
        extracted_values={"k": "اللواء الأول"},
        field_map={"f": "k"},
    )
    tiered_text = _format_evidence(tiered)
    assert "[FACTS FROM UPLOADED SOURCE FILES]" in tiered_text
    assert "[OPERATIONAL FILES]" in tiered_text
    assert "[DOCTRINE REFERENCE LIBRARY]" in tiered_text
    assert _bundle_is_tiered(tiered) is True
    # Spot-check that the tiered critique prompt embeds the typed-evidence rule
    assert "الحقائق الخاصة بالعملية" in _CRITIQUE_SYSTEM_TIERED_AR
    assert "[FACTS FROM UPLOADED SOURCE FILES]" in _CRITIQUE_SYSTEM_TIERED_AR
    print("OK tiered bundle: 3 headers, tiered critique prompt selected, typed-evidence rule embedded")

    print("\ncritique.py format smoke OK — Phase 4 typed-evidence prompt ready.")
