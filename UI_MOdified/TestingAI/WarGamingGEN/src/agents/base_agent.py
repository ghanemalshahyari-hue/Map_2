"""
base_agent.py — common scaffolding for Red / Blue / Adjudicator agents.

What every agent does:
  1. Loads its persona system prompt from src/agents/personas/<name>.md
  2. Formulates doctrine queries relevant to its role + the current phase
  3. Retrieves doctrine chunks via smart_search_client.retrieve()
  4. Builds a structured user-prompt = scenario context + state snapshot + Red/Blue's prior action (if applicable) + retrieved doctrine
  5. Calls LLMClient.call_with_schema() with the persona + user prompt
  6. Returns a Pydantic-validated output
"""
from __future__ import annotations
from dataclasses import dataclass
from pathlib import Path
from typing import Optional, Type
from pydantic import BaseModel

from ..llm.client import LLMClient
from ..llm.schemas import TurnAction
from ..retrieval.smart_search_client import retrieve, Chunk, format_for_prompt
from ..state.world_state import WorldState, UnitState
from ..state.world_state import PhaseMetrics
from ..parsers.scenario_parser import Scenario, Phase


# ============================================================================
# Helpers — text formatters used in all prompts
# ============================================================================

def _format_unit_compact(u: UnitState) -> str:
    """Compact one-line UID + critical attributes."""
    bits = [
        f"{u.uid}",
        f"({u.name_ar[:24]})",
        f"[{u.domain}/{u.type}]",
        f"echelon={u.echelon}",
        f"strength={u.strength:.1f}",
        f"status={u.status}",
    ]
    if u.suppressed_pct > 0: bits.append(f"sup={u.suppressed_pct:.0%}")
    if u.delayed_pct > 0:    bits.append(f"del={u.delayed_pct:.0%}")
    if u.airframes is not None: bits.append(f"airframes={u.airframes}")
    if u.hulls_remaining is not None: bits.append(f"hulls={u.hulls_remaining}")
    if u.magazine is not None: bits.append(f"mag={u.magazine}")
    if u.destroyed: bits.append("DESTROYED")
    return "  " + "  ".join(bits)


def _format_force_summary(world: WorldState, side: str, max_units_per_domain: int = 25) -> str:
    """Per-domain summary of one side's force. Truncate large lists."""
    out = [f"=== {side} order of battle (live state) ==="]
    for dom in ("strategic", "naval", "air", "ground", "sof"):
        units = [u for u in world.units.values() if u.side == side and u.domain == dom]
        alive = [u for u in units if not u.destroyed]
        out.append(f"\n  [{dom}] — alive: {len(alive)} / total: {len(units)}")
        # Show top N by strength (or just first N)
        for u in alive[:max_units_per_domain]:
            out.append(_format_unit_compact(u))
        if len(alive) > max_units_per_domain:
            out.append(f"  ... ({len(alive) - max_units_per_domain} more units omitted)")
    return "\n".join(out)


def _format_phase_state(world: WorldState, metrics: PhaseMetrics, phase: Phase) -> str:
    """Per-phase state block included in every agent prompt."""
    return (
        f"=== Phase {phase.step} ({phase.time_label}) — {phase.kind} ===\n"
        f"  Phase name (AR): {phase.phase_name_ar}\n"
        f"  Phase line     : {phase.phase_line_km} km from coast\n"
        f"  Force ratio    : local {metrics.force_ratio_local}:1 | operational {metrics.force_ratio_operational}:1\n"
        f"  Engine advantage call: {metrics.advantage_label} — {metrics.advantage_reason_brief}\n"
        f"  EW strength    : Red {metrics.ew_strength_red:.2f} | Blue {metrics.ew_strength_blue:.2f}\n"
        f"  Sea mines remaining: {metrics.blue_mines_remaining} (of 400 pre-laid)\n"
        f"  Red power total: {metrics.red_power_total} | Blue power total: {metrics.blue_power_total}\n"
        f"  Red power in contact: {metrics.red_power_in_contact} | Blue power in contact: {metrics.blue_power_in_contact}\n"
    )


def _format_scenario_short(scenario: Scenario) -> str:
    """Scenario fragment for context."""
    obj = scenario.objective
    return (
        f"=== Scenario ===\n"
        f"  Operation: {scenario.operation_name}\n"
        f"  AOI bbox  : lon [{scenario.bbox_wgs84[0]}, {scenario.bbox_wgs84[2]}], "
        f"lat [{scenario.bbox_wgs84[1]}, {scenario.bbox_wgs84[3]}]\n"
        f"  Coast lat : {scenario.coast_lat_approx}°N (Red lands from north, advances south)\n"
        f"  Objective : {obj.id} '{obj.name_ar}' at ({obj.lon}, {obj.lat}), "
        f"depth {obj.depth_km_from_coast} km from coast\n"
    )


# ============================================================================
# BaseAgent
# ============================================================================

@dataclass
class AgentResult:
    """Container for one agent turn's output + provenance."""
    side_or_role: str            # "RED" | "BLUE" | "ADJUDICATOR"
    phase: int
    output: BaseModel
    retrieved_chunks: list[Chunk]
    prompt_user: str
    raw_response: Optional[str] = None


class BaseAgent:
    """Common machinery for Red / Blue / Adjudicator.

    Subclasses must set: persona_file, name, output_schema, temperature.
    Subclasses must implement: _build_doctrine_queries() and act() / react() / resolve().
    """
    persona_file: str = ""
    name: str = "agent"
    output_schema: Type[BaseModel] = TurnAction
    temperature: float = 0.3

    def __init__(self, llm: LLMClient, world: WorldState, scenario: Scenario) -> None:
        self.llm = llm
        self.world = world
        self.scenario = scenario
        self._persona_cache: Optional[str] = None

    # ----- persona load -----
    def persona(self) -> str:
        """Load and cache the persona Markdown file."""
        if self._persona_cache is not None:
            return self._persona_cache
        path = Path(__file__).resolve().parent / "personas" / self.persona_file
        if not path.exists():
            raise FileNotFoundError(f"persona file missing: {path}")
        self._persona_cache = path.read_text(encoding="utf-8")
        return self._persona_cache

    # ----- doctrine retrieval -----
    def _build_doctrine_queries(self, phase: Phase, world: WorldState, metrics: PhaseMetrics) -> list[str]:
        """Override in subclass — returns a list of queries to fire at smart-search."""
        return []

    def _retrieve_doctrine(self, phase: Phase, world: WorldState, metrics: PhaseMetrics,
                            per_query_k: int = 3, max_chars: int = 4500) -> tuple[str, list[Chunk]]:
        """Fire all the agent's doctrine queries, merge results into a context block."""
        queries = self._build_doctrine_queries(phase, world, metrics)
        all_chunks: list[Chunk] = []
        seen_text: set[str] = set()
        for q in queries:
            chunks = retrieve(q, top_k=per_query_k, use_reranker=False, use_glossary=False)
            for c in chunks:
                key = c.text[:160]
                if key in seen_text: continue
                seen_text.add(key)
                all_chunks.append(c)
        return format_for_prompt(all_chunks, max_chars=max_chars), all_chunks

    # ----- generic LLM dispatch -----
    def _call_llm(self, user_prompt: str, tag: str, model: Optional[str] = None,
                   max_output_tokens: int = 6000,
                   validation_context: Optional[dict] = None) -> BaseModel:
        return self.llm.call_with_schema(
            schema=self.output_schema,
            system=self.persona(),
            user=user_prompt,
            model=model,
            temperature=self.temperature,
            max_output_tokens=max_output_tokens,
            max_retries=2,
            tag=tag,
            validation_context=validation_context,
        )
