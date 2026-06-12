"""graph/retrieval — Phase 2 retrieval package.

Synchronous `search(SearchRequest) -> SearchResponse` over one
existing Qdrant collection produced by the Phase 1 ingestion
pipeline. Hybrid dense + sparse retrieval with RRF fusion, a
cross-encoder reranker, and layered (glossary + optional HyDE)
query expansion. Not a LangGraph node — a plain function.

Design doc: referencedocs/17_phase2_retrieval.md.
Shared helpers (LLM + embedders) live under graph/shared/.

Every module in this package is runnable standalone via
`python -m graph.retrieval.<name> <collection> "<query>"`.
"""
