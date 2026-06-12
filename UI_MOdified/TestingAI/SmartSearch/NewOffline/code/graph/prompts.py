"""
graph/prompts.py — All LLM prompt templates used by the ingestion graph.

WHY ONE FILE FOR ALL PROMPTS:
  A prompt template is a reusable text blueprint with placeholders.
  Instead of hardcoding what we say to the LLM in the middle of node logic,
  we keep every prompt here.  One place to read, one place to change — no
  hunting through five nodes when tuning instructions.  If a future node
  (e.g. a Phase-2 QA/answer-generation node) also needs an LLM, its prompt
  belongs here next to the existing ones.

HOW PROMPTS WORK HERE:
  - `ChatPromptTemplate.from_messages([...])` takes a list of message tuples.
  - Each tuple is `(role, content)`: role is "system", "human", or "placeholder".
  - "system"      → background instructions the LLM reads silently before answering.
  - "human"       → the question/request being sent right now.
  - "placeholder" → a slot where runtime-built messages get injected.

  Nodes import the prompt constant they need and pipe it through a
  structured-output LLM via LangChain:
      chain = SUFFICIENCY_CHECK_PROMPT | llm.with_structured_output(Schema)
      result = chain.invoke({"messages": [("user", user_message)]})
"""

from langchain_core.prompts import ChatPromptTemplate


# =============================================================================
# SUFFICIENCY_CHECK_PROMPT
# Used by: graph/nodes/check_documents.py
#
# PURPOSE:
#   LLM gate at the entry of the MDMP doctrine ingestion pipeline.  Rejects
#   documents that are either (a) irrelevant to MDMP / military operations
#   planning or (b) unreadable junk, so the knowledge base stays focused
#   and retrieval signal is not diluted.
#
# HISTORY:
#   - M0.1 (2026-04-22): Relaxed from a topical "maneuver/combat operations"
#     filter to a topic-agnostic junk filter so Phase 3 can ingest
#     sustainment, fires, signal, aviation, CBRN, engineer, MP, EW, and
#     other specialty doctrine collections without being rejected at the
#     gate.  See referencedocs/18_phase3_generation.md §19.1.
#   - C18 (2026-04-22, post-C17, user directive): Re-tightened to an MDMP
#     topical filter.  Under C17 the corpus is deliberately MDMP-focused
#     (FM 6-0, FM 5-0, ADP 5-0, ADP 2-0) and v1 only targets MDMP Step 1
#     outputs.  A totally unrelated document reaching the ingest is now
#     considered a waste — the gate rejects it with an "irrelevant to MDMP"
#     remark.  Military-adjacent material (joint doctrine, tactical-but-
#     planning-relevant manuals) still passes; genuinely non-MDMP material
#     (cookbooks, unrelated civilian technical references) does not.
#   - C18 also added an explicit instruction for the garbled-text case so
#     the downstream OCR-retry classifier in check_documents.py can match
#     the remark reliably (see docs/pdf_failure_fallback_plan.md).
#
# DESIGN CONSTRAINTS (locked in memory.md):
#   - The gate is TOPICAL to MDMP (post-C18).  Non-MDMP documents are
#     rejected even if substantive.  Corpus / domain isolation remains the
#     retrieval-layer responsibility; this gate's job is the coarse cut.
#   - Filenames are NEVER shown to the LLM (memory.md Rule 1) — decisions
#     are content-only.  The gate node enforces this by stripping filenames
#     before building the user message.
#   - Binary documents (PDF/DOCX) appear as the placeholder string
#     "[Binary document — content to be extracted by the parser (<N> KB)]".
#     Unknown binary placeholders are NOT automatically accepted — at least
#     one document in the folder must show real substantive preview content
#     before the gate returns 'enough'.
#   - Rejection remarks for unreadable content must include a keyword from
#     {garbled, garbage, corrupt, unreadable, gibberish, encoded, cipher,
#     nonsense, unintelligible, illegible, mojibake} — the OCR-retry
#     classifier in check_documents.py regex-matches those words.
#
# RE-JUDGE CAVEAT (important when editing this prompt):
#   Changing this prompt does NOT automatically re-evaluate previously
#   rejected folders.  The gate node's cache behaviour is driven by the
#   upstream sha256 fingerprint of the source doc, not by the prompt text.
#   If you want an already-rejected folder to be re-judged under the new
#   prompt, either (a) change its content (any byte change flips sha256),
#   or (b) run with FORCE_REPARSE=1 in .env to bypass the upstream cache
#   gate end-to-end.  Previously-accepted folders stay accepted without
#   any action.
#
# WHEN TO CHANGE:
#   - You discover a class of genuinely non-ingestible content that the
#     current prompt lets through (e.g. scanned-blank-page PDFs).  Add a
#     new rejection criterion under "COUNT A DOCUMENT AS IRRELEVANT…".
#   - You add a topic filter upstream of ingestion.  In that case, keep
#     this prompt as-is — it is the last-line junk filter, not the topic
#     filter.
# =============================================================================

# The raw system-prompt string.  Exposed as its own constant (§C27,
# 2026-04-24) so ``check_documents`` can feed it directly to
# :func:`graph.shared.responses_client.invoke_structured` without going
# through LangChain.  The ChatPromptTemplate wrapper below stays for
# anything that still wants the legacy shape.
SUFFICIENCY_CHECK_SYSTEM_PROMPT = (
        "You are a relevance gate at the entry of an MDMP (Military Decision-Making "
        "Process) doctrine knowledge-base. Your only job is to decide, from the "
        "visible content of each document, whether it is relevant to MDMP — and "
        "substantive enough — to be worth parsing, chunking, and embedding.\n\n"

        "SCOPE — WHAT THIS KNOWLEDGE-BASE IS FOR:\n"
        "This corpus grounds the generation of MDMP Step 1 artefacts (mission "
        "receipt: Time Analysis + Initial Planning Guidance / WARNO) and, in later "
        "versions, the other MDMP steps (mission analysis, COA development / "
        "analysis / comparison / approval, orders production). Therefore the gate "
        "must reject documents that have nothing to do with military operations "
        "planning, regardless of how substantive they are in their own right — "
        "they would only dilute retrieval.\n\n"

        "COUNT A DOCUMENT AS RELEVANT (decision = 'enough') when its visible "
        "content is any of:\n"
        "- MDMP itself — steps, inputs/outputs, timelines, running estimates, "
        "  mission analysis, COA development/analysis/comparison/approval, orders "
        "  production.\n"
        "- Staff organization, roles, and processes (G/S-1 through G/S-9, running "
        "  estimates, commander-staff interaction, warfighting functions).\n"
        "- Orders and plans — OPORD, WARNO, FRAGO, OPLAN, annexes, running estimates.\n"
        "- Commander activities — intent, CCIR / PIR / FFIR / EEFI, guidance, risk "
        "  tolerance, decision points.\n"
        "- Operations process (plan → prepare → execute → assess), unified land "
        "  operations, tempo, operational art, mission command.\n"
        "- Intelligence preparation of the battlefield / operational environment "
        "  (IPB / IPOE), targeting, information collection, terrain and weather, "
        "  enemy / adversary analysis.\n"
        "- Army tactical manuals whose procedures feed MDMP — maneuver, fires, "
        "  sustainment, protection, mission command, intelligence, information-"
        "  operations — as long as they inform planning, not only execution.\n"
        "- Joint doctrine that parallels any of the above (JP 3-0, JP 5-0 etc.).\n\n"

        "COUNT A DOCUMENT AS IRRELEVANT (decision = 'not enough') when its "
        "visible content is any of:\n"
        "- Clearly non-military: cookbooks, marketing flyers, social-media threads, "
        "  personal letters, advertisements, receipts, entertainment, fiction, "
        "  newsletters, unrelated consumer product manuals.\n"
        "- Non-doctrinal military ephemera with no planning content: uniform "
        "  regulations, ceremony scripts, unit histories, awards citations, "
        "  recruiting brochures.\n"
        "- Empty, blank, or whitespace-only content.\n"
        "- Placeholder / cover-page-only / 'intentionally left blank' pages with "
        "  no body.\n"
        "- OCR / parse garbage: random symbols, repeated gibberish, no recoverable "
        "  sentences, obviously corrupted or unreadable text.\n"
        "- Technical material outside the military-operations domain (e.g. a "
        "  civilian medical textbook, a civil engineering standard, a programming "
        "  language reference) unless its content is clearly a referenced input to "
        "  a planning process.\n\n"

        "IMPORTANT JUDGEMENT RULES:\n"
        "- Relevance > substance. A well-written cookbook is substantive but not "
        "  relevant; reject it. A brief but genuine doctrinal excerpt is relevant "
        "  even if short; accept it.\n"
        "- When in doubt on a military-adjacent document, prefer 'enough' — an "
        "  extraneous doctrine reference is cheaper than a missing one, and "
        "  retrieval filters already narrow per-query.\n"
        "- Filenames are hidden from you by design (Rule 1). Judge only by visible "
        "  content. Do not guess the title from headings alone if the body is junk.\n\n"

        "BINARY DOCUMENTS:\n"
        "- If preview text is visible (extracted from the first pages), judge from "
        "  the preview.\n"
        "- If a binary document appears only as a '[Binary document — …]' "
        "  placeholder with no readable preview, treat it as UNKNOWN and return "
        "  'not enough' with a remark explaining the preview is missing.\n\n"

        "GARBLED / BROKEN-ENCODING TEXT:\n"
        "- If the preview looks garbled, corrupted, unreadable, encoded, or like "
        "  cipher / gibberish (e.g. body paragraphs replace letters with "
        "  punctuation or digits), return 'not enough' and USE one of those "
        "  words in the remark — an upstream OCR-retry loop watches for those "
        "  keywords and will automatically re-render the document via full-page "
        "  OCR before giving up on it.\n\n"

        "OUTPUT:\n"
        "The 'remarks' field should state (a) whether the document is relevant "
        "to MDMP, (b) a one-phrase reason, and (c) if rejected, whether the "
        "rejection is for irrelevance (non-MDMP) or for unreadable/garbled text."
)


# Legacy LangChain wrapper — retained for any caller that still routes
# through ``ChatPromptTemplate | llm.with_structured_output(...)``.  The
# migrated ``check_documents`` reads ``SUFFICIENCY_CHECK_SYSTEM_PROMPT``
# directly.  Safe to delete once no other consumer imports this name.
SUFFICIENCY_CHECK_PROMPT = ChatPromptTemplate.from_messages([
    ("system", SUFFICIENCY_CHECK_SYSTEM_PROMPT),
    ("placeholder", "{messages}"),
])
