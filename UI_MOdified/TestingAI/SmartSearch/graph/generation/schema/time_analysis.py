"""graph/generation/schema/time_analysis.py — thin re-export shim.

Real definitions live in :mod:`graph.generation.schema.schemas` (§18 C21,
2026-04-23). Kept so any legacy import path still resolves.
"""

from __future__ import annotations

from graph.generation.schema.schemas import (
    CURRENT_TIME_REFERENCE,
    MISSION_TIMELINE,
)

DOCUMENT_CLASSES = (MISSION_TIMELINE, CURRENT_TIME_REFERENCE)

__all__ = ["MISSION_TIMELINE", "CURRENT_TIME_REFERENCE", "DOCUMENT_CLASSES"]
