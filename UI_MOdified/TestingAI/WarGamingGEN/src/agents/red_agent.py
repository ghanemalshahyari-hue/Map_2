"""
red_agent.py — Red Force Commander LLM agent.

One public method: act(phase, metrics) → TurnAction (Red side).
"""
from __future__ import annotations
from typing import Optional
from ..llm.schemas import TurnAction
from ..state.world_state import PhaseMetrics
from ..parsers.scenario_parser import Phase
from .base_agent import BaseAgent, AgentResult, _format_force_summary, _format_phase_state, _format_scenario_short


# ============================================================================
# Per-phase doctrine queries — Red side
# ============================================================================
# We query the smart-search corpus with queries tilted toward Red's
# offensive doctrine + the specific phase kind. These are intentionally
# scoped: each query targets one or two retrievable doctrine chunks.

RED_QUERIES_BY_PHASE_KIND = {
    "shaping": [
        "amphibious operation preparation force generation marshalling",
        "joint amphibious operations five phases planning embarkation",
    ],
    "strategic_strike": [
        "SSM surface-to-surface missile opening salvo Tomahawk Libya 2011",
        "strategic strike doctrine deep operations corps",
    ],
    "sead": [
        "SEAD suppression enemy air defense Wild Weasel sortie share",
        "joint multi-service tactics suppressing SAM HARM",
    ],
    "naval_engagement": [
        "amphibious naval surface engagement Falklands Exocet",
        "Latakia 1973 first missile-on-missile naval battle EW",
        "Praying Mantis modern surface engagement",
    ],
    "mine_clearance": [
        "Wonsan 1950 minesweeper attrition under coastal artillery",
        "mine countermeasures amphibious operation",
    ],
    "h_hour_strike": [
        "Houthi Red Sea multi-vector saturation drone missile",
        "Ukrainian USV swarm Black Sea Magura survival",
        "Iwo Jima pre-landing bombardment effectiveness dug-in defender",
    ],
    "beach_assault": [
        "Tarawa beach obstacles reef vanguard losses",
        "amphibious vanguard first wave doctrine",
        "Cyprus 1974 airborne paratroop drop losses",
    ],
    "main_wave": [
        "main amphibious wave landing 4th Marine Infantry Division",
        "ATP-3.18 amphibious embarkation debarkation throughput",
    ],
    "beachhead_consolidation": [
        "beachhead consolidation lodgement defensive perimeter",
        "ATP 3-90.4 combined arms mobility breaching",
    ],
    "first_counterattack": [
        "mobile defense armored counterattack engagement area",
        "amphibious lodgement under armored counterattack",
    ],
    "9mid_lands": [
        "follow-on amphibious wave second division landing",
        "ATP 3-91 division operations attack",
    ],
    "push_inland": [
        "operational maneuver penetration exploitation",
        "ATP 3-90.5 combined arms battalion offensive",
    ],
    "1ad_lands": [
        "armored division exploitation operational maneuver",
        "amphibious phase 3 exploitation",
    ],
    "blue_op_reserve": [
        "armor counter-counterattack defending against operational reserve",
        "ADP 3-0 culmination point recognition",
    ],
    "culmination_check": [
        "culmination point attacker doctrine ADP 3-0",
        "operational reach combat power exhaustion",
    ],
    "final_red_push": [
        "final attack consolidate objective",
        "decisive strike final push amphibious",
    ],
    "final_resolution": [
        "decisive objective seizure amphibious",
        "force ratio 3:1 decisive offense prepared defense",
    ],
}


class RedAgent(BaseAgent):
    persona_file = "red.md"
    name = "red"
    output_schema = TurnAction

    def __init__(self, llm, world, scenario, temperature: float = 0.4):
        super().__init__(llm, world, scenario)
        self.temperature = temperature

    def _build_doctrine_queries(self, phase: Phase, world, metrics: PhaseMetrics) -> list[str]:
        kind = phase.kind or "shaping"
        return RED_QUERIES_BY_PHASE_KIND.get(kind, RED_QUERIES_BY_PHASE_KIND["shaping"])

    def act(self, phase: Phase, metrics: PhaseMetrics, prior_blue_actions: Optional[list[dict]] = None) -> AgentResult:
        """Compute Red's action for this phase.

        Args:
          phase   : Phase scenario object
          metrics : engine-computed PhaseMetrics (Red sees the force ratio + EW + mines remaining)
          prior_blue_actions: list of Blue's published actions from PRIOR phases
                              (Red has fog of war on Blue's reasoning, but sees what Blue did).

        Returns AgentResult with .output = TurnAction.
        """
        scenario_block = _format_scenario_short(self.scenario)
        state_block = _format_phase_state(self.world, metrics, phase)
        max_units = 3 if not self.llm.cfg.use_responses_api else 25
        doctrine_chars = 700 if not self.llm.cfg.use_responses_api else 4500
        force_block = _format_force_summary(self.world, "RED", max_units_per_domain=max_units)
        doctrine_block, chunks = self._retrieve_doctrine(
            phase, self.world, metrics, max_chars=doctrine_chars
        )

        prior_block = ""
        if prior_blue_actions:
            lines = ["=== Blue's published actions from prior phases ==="]
            for entry in prior_blue_actions[-3:]:   # last 3 phases — keep prompt manageable
                lines.append(f"  Phase {entry.get('phase')}: {entry.get('summary', '...')}")
            prior_block = "\n".join(lines) + "\n\n"

        user_prompt = (
            f"{scenario_block}\n"
            f"{state_block}\n"
            f"{prior_block}"
            f"{force_block}\n\n"
            f"=== Doctrine context (retrieved from smart-search corpus) ===\n"
            f"{doctrine_block}\n\n"
            f"=== TASK ===\n"
            f"You are Red. Decide your action for Phase {phase.step} ({phase.time_label} — {phase.phase_name_ar}).\n"
            f"Produce a TurnAction with per-component decisions across the 8 components "
            f"(strategic, maritime, air, mines, usv_uav, sof, land, ew).\n"
            f"For each component where Red has activity, fill in actor/what/why/intended_effect/doctrine_cited.\n"
            f"Set inactive components to null. Include overall_intent (2-3 sentences).\n"
            f"Use actual UIDs from the Red OOB above. Cite specific doctrine excerpts.\n\n"
            f"**HOLD-DOCUMENTATION RULE** — If you choose NOT to engage in a component "
            f"that would normally be active for this phase kind ({phase.kind!r}) — for "
            f"example, holding strategic SSMs in reserve for later phases, or skipping "
            f"a SEAD sortie because Blue's AD is already attrited — represent that as "
            f"an EXPLICIT HOLD entry in the relevant component, NOT a silent null. "
            f"Name the holding unit and in `what` write: \"Held in reserve — "
            f"[doctrinal reason]\" (e.g. 'Held in reserve — preserving SSM magazine for "
            f"H-hour saturation salvo per opening-day concentration doctrine'). "
            f"True null is fine when a domain genuinely has nothing relevant this phase "
            f"(e.g. mine warfare during deep strike), but a deliberate operational "
            f"hold decision must be documented.\n\n"
            f"Return strict JSON matching the TurnAction schema."
        )

        # Build UID hints so local models can be repaired before validation
        # when they emit actor=null for an explicit hold/action.
        red_uids = {u.uid for u in self.world.units.values() if u.side == "RED"}
        component_uid_hints = _component_uid_hints(self.world, "RED")
        out = self._call_llm(user_prompt, tag=f"red_phase{phase.step:02d}",
                              validation_context={
                                  "side_uids": red_uids,
                                  "component_uid_hints": component_uid_hints,
                              })

        # Force phase + side field consistency
        if isinstance(out, TurnAction):
            out.phase = phase.step
            out.side = "RED"

        return AgentResult(
            side_or_role="RED", phase=phase.step, output=out,
            retrieved_chunks=chunks, prompt_user=user_prompt,
        )


def _component_uid_hints(world, side: str) -> dict[str, list[str]]:
    units = [u for u in world.units.values() if u.side == side and not u.destroyed]

    def by_domain(*domains: str) -> list[str]:
        return [u.uid for u in units if u.domain in domains]

    def by_type_or_domain(token: str, *domains: str) -> list[str]:
        matched = [u.uid for u in units if token in (u.type or "").lower()]
        return matched or by_domain(*domains)

    return {
        "strategic": by_domain("strategic"),
        "maritime": by_domain("naval"),
        "air": by_domain("air"),
        "mines": by_type_or_domain("mine", "naval"),
        "usv_uav": by_type_or_domain("uav", "air", "naval"),
        "sof": by_domain("sof"),
        "land": by_domain("ground"),
        "ew": by_type_or_domain("ew", "ground"),
    }
