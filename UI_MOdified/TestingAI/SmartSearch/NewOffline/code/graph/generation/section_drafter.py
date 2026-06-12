"""graph/generation/section_drafter.py — ONE structured LLM call per group.

Given a :class:`GroupRetrievalResult` and the list of Arabic
per-field drafting prompts (from the YAML ``prompt_ar`` entries),
emit a structured JSON object whose keys are the retrieved fields
of this group and whose values are Arabic prose with inline
citation tags copied verbatim from the prefixed chunks.

Prompt shape per scoping §7.1:

    [SYSTEM — Arabic]        Role, citation rules, "غير متوفر" fallback
    [TASKS]                  One block per field with its prompt_ar
    [CONTEXT]                English chunks, each prefixed with its
                             pre-resolved citation tag (§6.6)
    [MISSION INPUT]          Subset of inputs the group may reference
    [SCHEMA]                 Pydantic JSON schema implied by
                             ``with_structured_output`` — the
                             LangChain layer handles this for us,
                             we just pass the dynamic sub-schema.

Output: a :class:`DraftResult` carrying the ``{field_name: drafted
Arabic text}`` mapping plus diagnostic metadata. The dispatcher /
cache consumes it; the renderer walks ``GroupRetrievalResult.hits``
for citation endnotes.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, create_model

from graph.generation.evidence import EvidenceBundle, build_evidence_bundle
from graph.generation.llm import DEFAULT_DRAFT_MODEL, draft_config
from graph.generation.retrieval_group import GroupRetrievalResult
from graph.generation.schema.inputs import Phase3Inputs
from graph.shared.responses_client import (
    ResponsesInvocationError,
    invoke_structured,
)

__all__ = ["DraftResult", "draft_group"]


@dataclass(frozen=True)
class DraftResult:
    group_name: str
    field_values: dict[str, str]
    prompt_char_count: int
    chunk_count: int


# --------------------------------------------------------------- system prompt

# Legacy-path system prompt — used when the evidence bundle has only
# the operationalfiles channel populated (every group pre-Phase-7).
# Byte-equal to the pre-§C29 prompt so cache keys + drafter behaviour
# stay identical for legacy templates.
_SYSTEM_PROMPT_AR = (
    "أنت مساعد عسكري يكتب محتوى وثيقة {doc_title_ar} بالعربية الفصحى. "
    "استخدم حصراً المقاطع العقيدية المعطاة في قسم [المصادر]. لا تُدخل أي "
    "حقائق غير موجودة في المقاطع.\n\n"
    "قواعد الاستشهاد:\n"
    "- ضع في نهاية كل جملة أساسية الوسمَ المكتوب بين قوسين مربَّعين بجانب "
    "المقطع المصدر حرفياً، مثال: [fm-3-0-operations §3-14].\n"
    "- لا تُعدِّل الوسم ولا تخترع واحداً. إذا اعتمدتَ على أكثر من مقطع في "
    "الجملة الواحدة، اكتب كل وسم منها.\n"
    '- إذا لم تدعم المقاطعُ حقلاً بعينه، اكتب في قيمته حرفياً: "غير متوفر '
    'في العقيدة المتاحة".\n\n'
    "قواعد اللغة:\n"
    "- اكتب نصاً عربياً فصيحاً واضحاً، بلا مصطلحات إنجليزية ما لم ترد في "
    "المقطع وتكن مصطلحاً تقنياً لا ترجمة له. المختصرات العربية مقبولة.\n"
    "- كل قيمة حقل يجب أن تكون فقرة واحدة متصلة — لا عناوين فرعية ولا قوائم "
    "تعدادية إلا إن طُلب ذلك صراحةً في تعليمات الحقل.\n\n"
    "أعد النتيجة كمستند JSON منظَّم وفق المخطَّط الموضَّح في استدعاء الأداة."
)


# Tier-aware system prompt — fires only when the bundle has a
# source_files OR doctrine channel populated (Phase 7+ tiered groups).
# Adds the typed-evidence drafting rules locked in
# tiered_retrieval_discussion.md: mission-specific facts must be
# supported by source_files OR operationalfiles; doctrine vouches
# only for definitions / standards / procedures / conceptual framing.
_SYSTEM_PROMPT_TIERED_AR = (
    "أنت مساعد عسكري يكتب محتوى وثيقة {doc_title_ar} بالعربية الفصحى. "
    "تتلقى الأدلة في ثلاث قنوات منفصلة بعناوين بين قوسين مربَّعين: "
    "[FACTS FROM UPLOADED SOURCE FILES] و[OPERATIONAL FILES] و"
    "[DOCTRINE REFERENCE LIBRARY]. أي قناة فارغة تُحذف من السياق.\n\n"
    "قواعد الأدلة المُصنَّفة (إلزامية):\n"
    "- الحقائق الخاصة بالعملية — كالوحدات والأشخاص والأماكن والأوقات "
    "والمعرِّفات وأي معطًى مرتبط بالسيناريو المحدَّد — لا تُستند إلا إلى "
    "[FACTS FROM UPLOADED SOURCE FILES] أو [OPERATIONAL FILES]. "
    "[DOCTRINE REFERENCE LIBRARY] وحدها لا تكفي للتحقُّق منها.\n"
    "- المفاهيم والتعاريف والمعايير والإجراءات والتأطير العقيدي يمكن "
    "إسنادها إلى [DOCTRINE REFERENCE LIBRARY] أو [OPERATIONAL FILES].\n"
    "- لا تُدخل أي اسم خاص (وحدة، مكان، شخص) لا يظهر حرفياً في إحدى قنوات "
    "[FACTS FROM UPLOADED SOURCE FILES] أو [OPERATIONAL FILES].\n\n"
    "قواعد الاستشهاد:\n"
    "- ضع في نهاية كل جملة أساسية الوسمَ بين قوسين مربَّعين كما ورد بجانب "
    "المقطع حرفياً (مثال: [fm-3-0-operations §3-14] للقناة التشغيلية، "
    "أو [S: warning_order §extracted] لملف رفعه المستخدم).\n"
    "- لا تُعدِّل الوسم ولا تخترع واحداً. إذا اعتمدتَ على أكثر من مقطع في "
    "الجملة الواحدة، اكتب كل وسم منها.\n"
    '- إذا لم تدعم القنواتُ حقلاً بعينه، اكتب في قيمته حرفياً: "غير متوفر '
    'في العقيدة المتاحة".\n\n'
    "قواعد اللغة:\n"
    "- اكتب نصاً عربياً فصيحاً واضحاً، بلا مصطلحات إنجليزية ما لم ترد في "
    "المقطع وتكن مصطلحاً تقنياً لا ترجمة له. المختصرات العربية مقبولة.\n"
    "- كل قيمة حقل يجب أن تكون فقرة واحدة متصلة — لا عناوين فرعية ولا قوائم "
    "تعدادية إلا إن طُلب ذلك صراحةً في تعليمات الحقل.\n\n"
    "أعد النتيجة كمستند JSON منظَّم وفق المخطَّط الموضَّح في استدعاء الأداة."
)


def _bundle_is_tiered(evidence: EvidenceBundle) -> bool:
    """A bundle is "tiered" when it has any source_files or doctrine
    evidence — i.e. when at least one channel beyond operationalfiles
    is populated. Pre-Phase-7 every legacy bundle is operationalfiles-
    only and this returns False, keeping the prompt byte-equal to the
    §C28 baseline.
    """
    return bool(evidence.source_files_evidence) or bool(evidence.doctrine_evidence)


# --------------------------------------------------------------- helpers

def _render_sourced_hits(hits: tuple[Any, ...]) -> str:
    """Render every kept SourcedHit as a ``[tag] text`` block.

    The drafter's instruction is to copy ``[tag]`` verbatim, so we
    keep the tag on its own bracketed form immediately before the
    chunk text. Chunks are separated by a blank line for readability.
    """
    blocks: list[str] = []
    for sh in hits:
        text = sh.hit.text.strip().replace("\r\n", "\n")
        blocks.append(f"{sh.citation_tag}  {text}")
    return "\n\n".join(blocks)


def _render_fact_snippets(snippets: tuple[Any, ...]) -> str:
    """Render every FactSnippet as a ``[S: <kind> §extracted] - <field>: <text>`` block.

    Tier-prefixed citation tags ship in Phase 6 + 7; this renderer
    emits the prefixed shape today because FactSnippets appear in the
    bundle ONLY when a tier-aware group is active (which is exactly
    when prefixed tags are wanted).
    """
    blocks: list[str] = []
    for snip in snippets:
        kind = snip.source_file_kind or snip.field_name
        tag = f"[S: {kind} §extracted]"
        text = snip.text.strip().replace("\r\n", "\n")
        blocks.append(f"{tag}  - {snip.field_name}: {text}")
    return "\n\n".join(blocks)


def _format_evidence(evidence: EvidenceBundle) -> str:
    """Render the bundle's three channels as drafter-prompt context.

    Two shapes:
      * Legacy (operationalfiles-only, no FactSnippets, no doctrine):
        emit chunks WITHOUT a header — byte-equal to the pre-§C29
        ``_format_chunks(retrieval)`` output so cache keys + drafter
        behaviour stay identical for legacy templates.
      * Tier-aware (any channel beyond operationalfiles populated):
        emit one labelled block per non-empty channel, in the
        canonical order (source_files → operationalfiles → doctrine).
        Empty channels are omitted entirely from the prompt.
    """
    of = evidence.operationalfiles_evidence
    sf = evidence.source_files_evidence
    doc = evidence.doctrine_evidence

    if not _bundle_is_tiered(evidence):
        # Legacy fast-path — no labelled headers, just the chunks.
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


def _format_mission_input_subset(inputs: Phase3Inputs, retrieval: GroupRetrievalResult) -> str:
    """Minimal subset of inputs the drafter might need — keeps the
    prompt compact.

    We don't try to introspect which seeds referenced which fields;
    instead we include the operation + mission_intent_free_text
    block that every Phase 3 template uses for axis/echelon/type
    placeholders. The drafter ignores what it doesn't need.
    """
    op = inputs.operation
    lines = [
        f"operation.name            = {op.name}",
        f"operation.echelon         = {op.echelon}",
        f"operation.axis            = {op.axis}",
        f"operation.operation_type  = {op.operation_type}",
        f"mission_intent_free_text  = {inputs.mission_intent_free_text}",
    ]
    return "\n".join(lines)


def _format_task_block(retrieval: GroupRetrievalResult) -> str:
    """Per-field drafting instructions, concatenated.

    Each retrieved field in the group has its own ``prompt_ar``.
    We number them with Arabic section markers so the drafter can
    easily route its output to each key.
    """
    group = retrieval.group
    blocks: list[str] = []
    for idx, (fname, spec) in enumerate(
        zip(group.field_names, group.field_specs), start=1
    ):
        instruction = (spec.prompt_ar or "").strip()
        blocks.append(f"### ({idx}) {fname}\n{instruction}")
    return "\n\n".join(blocks)


def _build_group_output_model(retrieval: GroupRetrievalResult) -> type[BaseModel]:
    """Dynamically construct a Pydantic model with one str field per
    retrieved field in the group.

    ``with_structured_output`` uses this as the tool-call schema, so
    every key present here WILL appear in the LLM output. We set
    ``extra="forbid"`` so the LLM can't invent extra fields.
    """
    group = retrieval.group
    fields: dict[str, Any] = {
        fname: (str, Field(description=f"Arabic value for field {fname!r}"))
        for fname in group.field_names
    }
    model_name = f"Draft_{group.group_name}"
    cfg = ConfigDict(extra="forbid")
    # Using pydantic.create_model because we build the field set dynamically.
    return create_model(model_name, __config__=cfg, **fields)  # type: ignore[return-value]


# --------------------------------------------------------------- main entry

def draft_group(
    retrieval: GroupRetrievalResult,
    inputs: Phase3Inputs,
    *,
    doc_title_ar: str,
    evidence: EvidenceBundle | None = None,
) -> DraftResult:
    """Call the draft LLM once and return a DraftResult.

    The caller (dispatcher) is expected to feed ``doc_title_ar``
    from the template's ``meta.title_arabic`` so the system prompt
    says "this document is OPORD / Staff Estimates / ..." rather
    than a generic string.

    ``evidence`` (added in tiered-retrieval Phases 3+4 — §C30) carries
    the three labelled evidence channels — source_files / operationalfiles
    / doctrine. When ``None``, the drafter builds a legacy
    operationalfiles-only bundle from ``retrieval`` so existing call
    sites keep working unchanged. The system prompt + context
    formatting fall back to the pre-§C30 byte-equal shape when the
    bundle is operationalfiles-only.
    """
    if evidence is None:
        # Boundary adapter: convert legacy retrieval to a bundle so
        # downstream code only deals with one evidence shape.
        evidence = build_evidence_bundle(group_result=retrieval)

    if not retrieval.hits and not evidence.source_files_evidence:
        # Zero-evidence safety net: emit "غير متوفر" for every field
        # without even calling the LLM. This happens when every
        # allowlisted source_doc is elided and corpus-wide retrieval
        # returns no hits for the seeds, AND the bundle has no
        # source_files facts to fall back on.
        return DraftResult(
            group_name=retrieval.group.group_name,
            field_values={
                fname: "غير متوفر في العقيدة المتاحة"
                for fname in retrieval.group.field_names
            },
            prompt_char_count=0,
            chunk_count=0,
        )

    if _bundle_is_tiered(evidence):
        sys_prompt = _SYSTEM_PROMPT_TIERED_AR.format(doc_title_ar=doc_title_ar)
    else:
        sys_prompt = _SYSTEM_PROMPT_AR.format(doc_title_ar=doc_title_ar)
    tasks = _format_task_block(retrieval)
    context = _format_evidence(evidence)
    mission_input = _format_mission_input_subset(inputs, retrieval)

    user_prompt = (
        f"[المهام]\n{tasks}\n\n"
        f"[المصادر]\n{context}\n\n"
        f"[المعطيات من المستخدم]\n{mission_input}"
    )

    OutputModel = _build_group_output_model(retrieval)
    _, draft_temperature = draft_config()
    try:
        structured_result = invoke_structured(
            role_env="PHASE3_DRAFT_MODEL",
            default_model=DEFAULT_DRAFT_MODEL,
            temperature=draft_temperature,
            schema=OutputModel,
            system=sys_prompt,
            user=user_prompt,
            schema_name=f"draft_{retrieval.group.group_name}",
        )
    except ResponsesInvocationError:
        # Drafter failure is load-bearing — bubble it up so the caller
        # can decide whether to fall back to the Arabic placeholder or
        # abort the run.  The adapter has already logged diagnostics.
        raise

    result = structured_result.value
    assert isinstance(result, BaseModel)

    field_values: dict[str, str] = {}
    for fname in retrieval.group.field_names:
        raw = getattr(result, fname, "") or ""
        field_values[fname] = str(raw).strip()

    return DraftResult(
        group_name=retrieval.group.group_name,
        field_values=field_values,
        prompt_char_count=len(sys_prompt) + len(user_prompt),
        chunk_count=len(retrieval.hits),
    )


# --------------------------------------------------------------- self-smoke

if __name__ == "__main__":
    # Synthetic test for the §C30 acceptance criterion (no LLM, no
    # Qdrant): a 3-channel bundle yields exactly the three labelled
    # headers; a FactSnippet's text never appears inside the
    # operationalfiles or doctrine blocks; a legacy operationalfiles-
    # only bundle has no headers at all.
    from types import SimpleNamespace

    from graph.generation.evidence import FactSnippet
    from graph.generation.retrieval_group import SourcedHit
    from graph.retrieval.schema import SearchHit

    hit_a = SourcedHit(
        hit=SearchHit(
            point_id="a", text="فقرة عقيدة أ", heading_path="",
            source_doc="FM-X", page_numbers=[1], chunk_type="body",
            chunk_index=0, paragraph_number="1-1", paragraph_numbers=["1-1"],
            cross_refs=[], rrf_score=0.0,
        ),
        collection="ingest__operationalfiles__bgem3",
        citation_tag="[FM-X §1-1]",
    )
    hit_d = SourcedHit(
        hit=SearchHit(
            point_id="d", text="فقرة مرجعية ب", heading_path="",
            source_doc="DOC-Y", page_numbers=[2], chunk_type="body",
            chunk_index=0, paragraph_number="2-2", paragraph_numbers=["2-2"],
            cross_refs=[], rrf_score=0.0,
        ),
        collection="ingest__doctrine__bgem3",
        citation_tag="[DOC-Y §2-2]",
        tier="doctrine",
    )
    snip = FactSnippet(
        field_name="task_org",
        text="اللواء الأول — مشاة",
        source_file_kind="warning_order",
        source_file_sha256="abc",
    )

    # Legacy bundle: only operationalfiles channel populated.
    legacy = build_evidence_bundle(
        group_result=SimpleNamespace(hits=(hit_a,)),  # type: ignore[arg-type]
    )
    legacy_text = _format_evidence(legacy)
    assert "[OPERATIONAL FILES]" not in legacy_text, "legacy bundle leaked the tiered header"
    assert "[FACTS FROM UPLOADED SOURCE FILES]" not in legacy_text
    assert "[DOCTRINE REFERENCE LIBRARY]" not in legacy_text
    assert "[FM-X §1-1]" in legacy_text
    print("OK legacy operationalfiles-only bundle: header-free, byte-equal shape")

    # Tier-aware bundle: all three channels populated.
    tiered = build_evidence_bundle(
        group_result=SimpleNamespace(hits=(hit_a, hit_d)),  # type: ignore[arg-type]
        extracted_values={"task_org_key": "اللواء الأول — مشاة"},
        field_map={"task_org": "task_org_key"},
    )
    tiered_text = _format_evidence(tiered)
    assert "[FACTS FROM UPLOADED SOURCE FILES]" in tiered_text
    assert "[OPERATIONAL FILES]" in tiered_text
    assert "[DOCTRINE REFERENCE LIBRARY]" in tiered_text
    # FactSnippet text must appear ONLY under the source_files header
    sf_idx = tiered_text.index("[FACTS FROM UPLOADED SOURCE FILES]")
    of_idx = tiered_text.index("[OPERATIONAL FILES]")
    doc_idx = tiered_text.index("[DOCTRINE REFERENCE LIBRARY]")
    assert sf_idx < of_idx < doc_idx, "tiered headers out of order"
    snip_idx = tiered_text.index("اللواء الأول")
    assert sf_idx < snip_idx < of_idx, "FactSnippet leaked outside [FACTS FROM UPLOADED SOURCE FILES]"
    print("OK tiered 3-channel bundle: 3 headers in order, FactSnippet contained to source_files block")

    # is_tiered detector
    assert _bundle_is_tiered(tiered) is True
    assert _bundle_is_tiered(legacy) is False
    print("OK _bundle_is_tiered detector")

    print("\nsection_drafter.py format smoke OK — Phase 3 prompt blocks ready.")
