"""
blue_agent.py — Blue JTF Commander LLM agent.

Public method: react(phase, metrics, red_action) → TurnAction (Blue side).
"""
from __future__ import annotations
from typing import Optional
from ..llm.schemas import TurnAction
from ..state.world_state import PhaseMetrics
from ..parsers.scenario_parser import Phase
from .base_agent import BaseAgent, AgentResult, _format_force_summary, _format_phase_state, _format_scenario_short


# Per-phase doctrine queries — Blue side (defensive-tilted)
BLUE_QUERIES_BY_PHASE_KIND = {
    "shaping": [
        "prepared defense doctrine FM 3-90 multiplier",
        "coastal defense layered air defense pre-positioning",
        "ATP 3-37.5 countermobility sea mine integration",
    ],
    "strategic_strike": [
        "deep strike longer range SSM Blue advantage",
        "ATP 3-91 division deep operations",
        "NATO Libya 2011 Tomahawk opening salvo defender",
    ],
    "sead": [
        "S-300 Hawk SAM survival hardened dispersed",
        "ATP 3-01.81 counter-UAS counter-unmanned",
        "ATP 3-01.8 combined arms air defense layered",
    ],
    "naval_engagement": [
        "coastal defense corvette anti-ship missile defense",
        "AJP-3.1 maritime sea denial",
        "Moskva 2022 shore-based anti-ship missile Neptune",
    ],
    "mine_clearance": [
        "Wonsan 1950 mine field killing minesweepers coastal artillery overwatch",
        "ATP-71 mine countermeasures defense",
    ],
    "h_hour_strike": [
        "Iran April 2024 layered air defense intercept saturation",
        "ATP 3-01.81 counter-UAS C-UAS swarm",
        "coastal artillery anti-ship missile",
    ],
    "beach_assault": [
        "front-line coastal defense first wave engagement",
        "ATP 3-37.5 obstacle covered by fire",
        "FM 3-90 area defense",
    ],
    "main_wave": [
        "ATGM ambush engagement area defense in depth",
        "ATP 3-09.42 fire support brigade",
    ],
    "beachhead_consolidation": [
        "defense in depth second line consolidation",
        "ATP 3-91 division defense",
    ],
    "first_counterattack": [
        "mobile defense armored counterattack ADP 3-90",
        "FM 3-90 mobile defense reserve commitment",
        "AJP-3.2 land operations counterattack",
    ],
    "9mid_lands": [
        "defense against follow-on amphibious wave",
        "ATP 3-90.5 combined arms battalion defense",
    ],
    "push_inland": [
        "delaying action retrograde operations second defensive belt",
        "MANPADS engagement helicopter assault",
    ],
    "1ad_lands": [
        "anti-armor TOW ambush engagement area",
        "ATP 3-91 division defense in depth",
    ],
    "blue_op_reserve": [
        "operational reserve commitment culmination point",
        "ADP 3-0 culmination armored counterattack",
        "ATP 3-90.5 mobile defense reserve",
    ],
    "culmination_check": [
        "defense at culmination ADP 3-0",
        "obstacle belts multi-layered defense final",
    ],
    "final_red_push": [
        "final defensive position last stand objective",
        "force ratio less than 1.5:1 denial doctrine",
    ],
    "final_resolution": [
        "operational denial defender holds objective",
        "FM 3-90 defensive operations decisive",
    ],
}


class BlueAgent(BaseAgent):
    persona_file = "blue.md"
    name = "blue"
    output_schema = TurnAction

    def __init__(self, llm, world, scenario, temperature: float = 0.3):
        super().__init__(llm, world, scenario)
        self.temperature = temperature

    def _build_doctrine_queries(self, phase: Phase, world, metrics: PhaseMetrics) -> list[str]:
        kind = phase.kind or "shaping"
        return BLUE_QUERIES_BY_PHASE_KIND.get(kind, BLUE_QUERIES_BY_PHASE_KIND["shaping"])

    def react(self, phase: Phase, metrics: PhaseMetrics, red_action: TurnAction) -> AgentResult:
        """Compute Blue's reaction for this phase, given Red's just-published action."""
        scenario_block = _format_scenario_short(self.scenario)
        state_block = _format_phase_state(self.world, metrics, phase)
        max_units = 3 if not self.llm.cfg.use_responses_api else 25
        doctrine_chars = 700 if not self.llm.cfg.use_responses_api else 4500
        force_block = _format_force_summary(self.world, "BLUE", max_units_per_domain=max_units)
        doctrine_block, chunks = self._retrieve_doctrine(
            phase, self.world, metrics, max_chars=doctrine_chars
        )

        # Red's action — strip Red's "why" / "intended_effect" / "doctrine" (fog of war).
        # Blue sees WHAT Red did, not the reasoning.
        red_observable = self._build_observable_red_action(red_action)
        red_components_active = [
            cn for cn, c in red_action.components().items() if c is not None
        ]
        n_red_active = len(red_components_active)

        user_prompt = (
            f"{scenario_block}\n"
            f"{state_block}\n"
            f"=== Red's just-played action this phase (what Red did — you do NOT see Red's internal reasoning) ===\n"
            f"{red_observable}\n\n"
            f"{force_block}\n\n"
            f"=== Doctrine context (retrieved from smart-search corpus) ===\n"
            f"{doctrine_block}\n\n"
            f"=== TASK ===\n"
            f"You are Blue. React to Red's action in Phase {phase.step} ({phase.time_label} — {phase.phase_name_ar}).\n"
            f"Produce a TurnAction with per-component reactions across the 8 components.\n"
            f"For each component where Blue acts, fill in actor/what/why/intended_effect/doctrine_cited.\n"
            f"Set inactive components to null. Include overall_intent (2-3 sentences).\n"
            f"Use actual UIDs from the Blue OOB above. Cite specific doctrine excerpts.\n\n"
            f"**REACTION RULE** — Red engaged {n_red_active} component(s) this phase: "
            f"{', '.join(red_components_active) if red_components_active else 'none'}.\n"
            f"For each Red engagement you must respond with EITHER:\n"
            f"  (a) An ACTIVE DEFENDING action — name a defending unit (e.g. if Red ran "
            f"`air`, your `air` or `ew` engages; if Red ran `usv_uav`, your `maritime` "
            f"or `air` intercepts; if Red ran `land`, your `land` or `air` counters); OR\n"
            f"  (b) An EXPLICIT HOLD-POSITION decision — name the specific unit holding "
            f"(e.g. B-72-AD), and in `what` write: \"Held position — [doctrinal reason]\" "
            f"(e.g. 'Held position — preserving reserve combat power for Red culmination "
            f"per ADP 3-0', or 'Held position — Red strike already absorbed by hardened "
            f"S-300 battery, counter-launch wastes magazine per ATP 3-01.8 economy of "
            f"force').\n"
            f"Holding is a legitimate tactical choice when the situation favors patience "
            f"(preserving reserves, forcing Red culmination, absorbing a degraded strike). "
            f"But a null component when Red engaged in that domain — with no named holding "
            f"unit and no documented reason — is INCORRECT output. In your overall_intent, "
            f"state your high-level posture (active defense / mobile defense / "
            f"hold-and-attrit / reserve commitment).\n\n"
            f"Return strict JSON matching the TurnAction schema."
        )

        blue_uids = {u.uid for u in self.world.units.values() if u.side == "BLUE"}
        component_uid_hints = _component_uid_hints(self.world, "BLUE")
        out = self._call_llm(user_prompt, tag=f"blue_phase{phase.step:02d}",
                              validation_context={
                                  "side_uids": blue_uids,
                                  "component_uid_hints": component_uid_hints,
                              })
        if isinstance(out, TurnAction):
            out.phase = phase.step
            out.side = "BLUE"

        return AgentResult(
            side_or_role="BLUE", phase=phase.step, output=out,
            retrieved_chunks=chunks, prompt_user=user_prompt,
        )

    def _build_observable_red_action(self, red: TurnAction) -> str:
        """Show Blue ONLY what Red did, not Red's reasoning. Fog of war."""
        lines = [f"  Overall Red intent (observable from actions, not stated): inferable from per-component activity below."]
        for comp_name, comp in red.components().items():
            if comp is None:
                continue
            # Strip 'why', 'intended_effect', 'doctrine_cited' — Blue doesn't see Red's plans.
            lines.append(f"  [{comp_name}] actor={comp.actor} — {comp.what}")
        return "\n".join(lines)


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
        "mines": by_type_or_domain("mine", "ground", "naval"),
        "usv_uav": by_type_or_domain("uav", "air", "ground"),
        "sof": by_domain("sof"),
        "land": by_domain("ground"),
        "ew": by_type_or_domain("ew", "ground"),
    }
