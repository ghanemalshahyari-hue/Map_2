"""graph/generation/schema/opord.py — re-export shim.

Real definitions live in :mod:`graph.generation.schema.schemas` (§18 C21,
2026-04-23). Used by both ``operation_order.yaml`` (v2) and
``warning_order.yaml`` (v1) via the template_id→module map in the loader.
"""

from __future__ import annotations

from graph.generation.schema.schemas import (
    Annexes,
    HeaderSection,
    MetadataSection,
    MissionAndExecution,
    OperationalSituation,
    SustainmentAndCoordination,
)

DOCUMENT_CLASSES = (
    HeaderSection,
    MetadataSection,
    OperationalSituation,
    MissionAndExecution,
    SustainmentAndCoordination,
    Annexes,
)

__all__ = [
    "HeaderSection",
    "MetadataSection",
    "OperationalSituation",
    "MissionAndExecution",
    "SustainmentAndCoordination",
    "Annexes",
    "DOCUMENT_CLASSES",
]
