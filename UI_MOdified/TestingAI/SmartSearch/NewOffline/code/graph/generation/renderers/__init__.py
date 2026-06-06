"""graph/generation/renderers — output-format renderers for Phase 3.

v1 ships only ``.docx`` (user directive 2026-04-22, §18 C1 of the
scoping doc). PDF and TXT renderers are explicitly out of scope.

Submodules:
    arabic_docx   Ported verbatim from the user's prior generator;
                  behaviour-preserving on kashida / bidi / numbering
                  cycles / table styling per referencedoc 19.
"""
