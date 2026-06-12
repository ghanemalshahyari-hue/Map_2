"""graph/shared — narrow, additive helpers shared between ingestion
(Phase 1 nodes under graph/nodes/) and retrieval (Phase 2 modules
under graph/retrieval/).

This package exists so a single authoritative singleton (LLM,
embedders) is defined in one place instead of being duplicated
across the two layers. See referencedocs/17_phase2_retrieval.md
§10.5 ("Shared-helper extraction — locked: Option B").

Rule: only extract a helper here when at least two call sites
already exist and would otherwise duplicate the same singleton.
Do NOT turn this into a dumping ground for utilities.
"""
