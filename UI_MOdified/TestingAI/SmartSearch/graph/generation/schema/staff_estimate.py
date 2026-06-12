"""graph/generation/schema/staff_estimate.py — re-export shim.

Real definitions live in :mod:`graph.generation.schema.schemas` (§18 C21,
2026-04-23). Used by both ``staff_estimate.yaml`` (v2) and
``staff_brief.yaml`` (v1) via the template_id→module map in the loader.
"""

from __future__ import annotations

from graph.generation.schema.schemas import (
    INTELLIGENCE_ESTIMATE,
    LOGISTICS_ESTIMATE,
    OPERATIONS_ESTIMATE,
    PERSONNEL_ESTIMATE,
)

DOCUMENT_CLASSES = (
    INTELLIGENCE_ESTIMATE,
    OPERATIONS_ESTIMATE,
    PERSONNEL_ESTIMATE,
    LOGISTICS_ESTIMATE,
)

__all__ = [
    "INTELLIGENCE_ESTIMATE",
    "OPERATIONS_ESTIMATE",
    "PERSONNEL_ESTIMATE",
    "LOGISTICS_ESTIMATE",
    "DOCUMENT_CLASSES",
]
