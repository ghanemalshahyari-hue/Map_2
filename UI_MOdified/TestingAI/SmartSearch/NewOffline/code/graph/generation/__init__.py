"""graph/generation — Phase 3 document generation package.

Template-driven generator that walks a YAML spec per document,
dispatches each schema field by one of five kinds
(`static`/`computed`/`input`/`derived`/`retrieved`), calls Phase 2
`search()` only for `retrieved` fields (grouped one LLM call per
Pydantic class), and renders four Arabic `.docx` files per run.

Design doc: referencedocs/18_phase3_generation.md (authoritative).
Template spec:  referencedocs/20_phase3_templates_and_kinds.md.
Renderer port guide: referencedocs/19_phase3_arabic_renderer.md.
Project overview: docs/phase3_walkthrough.md.

Every module in this package is runnable standalone for M2+ debug:
    python -m graph.generation.<name> <args>

M1 scope (implemented): `schema/` modules + `template_loader.py`.
M2+ scope (not yet written): field_dispatcher, time_math,
retrieval_group, section_drafter, critique, assembler, cache,
llm, renderers/arabic_docx.
"""
