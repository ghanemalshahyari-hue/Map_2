"""
adjudicator.py — Neutral wargame umpire.

Two public methods:
  scene_setter(phase, metrics) → str   — generates a brief situation summary
  resolve(phase, metrics, red_action, blue_reaction) → PhaseResolution
"""
from __future__ import annotations
from typing import Optional
from ..llm.schemas import TurnAction, PhaseResolution
from ..state.world_state import PhaseMetrics
from ..parsers.scenario_parser import Phase
from .base_agent import BaseAgent, AgentResult, _format_phase_state, _format_scenario_short, _format_force_summary


# Per-phase doctrine queries — adjudicator (resolution/calibration tilt)
ADJ_QUERIES_BY_PHASE_KIND = {
    "shaping": [
        "wargame methodology force ratio computation",
        "calibration table attrition coefficients historical analogs",
    ],
    "strategic_strike": [
        "NATO Libya 2011 Tomahawk salvo effectiveness",
        "Iran April 2024 strike Israel intercept rate",
    ],
    "sead": [
        "Wild Weasel SA-2 hit rate Vietnam attrition",
        "SEAD sortie loss rate modern war 25-30 percent",
    ],
    "naval_engagement": [
        "Falklands ASCM hit probability kill cruiser",
        "Latakia 1973 chaff ECM soft-kill missile defense",
        "anti-ship missile dud factor 25 percent",
    ],
    "mine_clearance": [
        "Wonsan 1950 minesweeper attrition coastal artillery",
        "Gallipoli 1915 mine field Allied battleship losses",
        "Sea mine kill rate capital ship per 100 mines",
    ],
    "h_hour_strike": [
        "Houthi saturation defender intercept rate 60 percent",
        "Black Sea 2024 USV survival 25 30 percent",
        "Iwo Jima bombardment effect 0.10 attrition",
    ],
    "beach_assault": [
        "Cyprus 1974 airborne drop loss 6 percent",
        "Tarawa beach mine field reef obstacle losses",
        "ATGM kill rate 10 15 percent armor",
    ],
    "main_wave": [
        "main wave amphibious landing throughput",
        "ATGM ambush kill rate prepared defense 10 15 percent",
    ],
    "beachhead_consolidation": [
        "ATGM ambush kill rate 10 15 percent armor advance",
        "consolidation phase casualty rates",
    ],
    "first_counterattack": [
        "ADP 3-90 reserve commitment timing culmination",
        "armored counterattack effectiveness historical",
    ],
    "9mid_lands": [
        "follow-on division integration",
        "second wave amphibious landing rates",
    ],
    "push_inland": [
        "operational tempo inland advance rates",
        "MANPADS attack helicopter shot down",
    ],
    "1ad_lands": [
        "armored exploitation rates historical",
        "phase 3 amphibious exploitation",
    ],
    "blue_op_reserve": [
        "operational reserve commitment kill rate",
        "armored counter-counterattack",
    ],
    "culmination_check": [
        "ADP 3-0 culmination point recognition force ratio",
        "operational reach combat power depletion",
    ],
    "final_red_push": [
        "final assault objective seizure rates",
        "force ratio culmination 1.5 threshold",
    ],
    "final_resolution": [
        "FM 3-90 3:1 attacker decisive offense prepared defense",
        "operational outcome force ratio threshold",
    ],
}


class Adjudicator(BaseAgent):
    persona_file = "adjudicator.md"
    name = "adjudicator"
    output_schema = PhaseResolution

    def __init__(self, llm, world, scenario, temperature: float = 0.1):
        super().__init__(llm, world, scenario)
        self.temperature = temperature

    def _build_doctrine_queries(self, phase: Phase, world, metrics: PhaseMetrics) -> list[str]:
        kind = phase.kind or "shaping"
        return ADJ_QUERIES_BY_PHASE_KIND.get(kind, ADJ_QUERIES_BY_PHASE_KIND["shaping"])

    # -----------------------------------------------------------------
    # Scene setter — short narrative summary
    # -----------------------------------------------------------------
    def scene_setter(self, phase: Phase, metrics: PhaseMetrics) -> str:
        """Generate a 2-sentence situation summary (no schema)."""
        scenario_block = _format_scenario_short(self.scenario)
        state_block = _format_phase_state(self.world, metrics, phase)

        user_prompt = (
            f"{scenario_block}\n"
            f"{state_block}\n\n"
            f"=== TASK ===\n"
            f"Write a 2-sentence neutral situation summary for Phase {phase.step}, "
            f"opening with the time label (e.g. 'At D-7…'). "
            f"State the operational posture. No predictions; no advantage call yet. "
            f"Plain prose, no JSON, no markdown."
        )
        return self.llm.call_text(
            system=self.persona(),
            user=user_prompt,
            temperature=0.0, max_output_tokens=300,
            tag=f"adjudicator_scene_phase{phase.step:02d}",
        ).strip()

    # -----------------------------------------------------------------
    # Resolve — full PhaseResolution
    # -----------------------------------------------------------------
    def _build_engagement_inventory(self, red: TurnAction, blue: TurnAction) -> str:
        """For every actor named in red/blue actions, pull its live state from the
        world so the LLM can assign outcomes against REAL weapon counts/targets."""
        rows: list[str] = []
        for label, ta in [("RED", red), ("BLUE", blue)]:
            for cn, comp in ta.components().items():
                if comp is None: continue
                u = self.world.units.get(comp.actor)
                if not u:
                    rows.append(f"  [{label}/{cn}] actor={comp.actor!r} (NOT IN OOB — verify UID)")
                    continue
                attrs = [f"strength={u.strength:.1f}"]
                if u.magazine is not None: attrs.append(f"mag={u.magazine}")
                if u.airframes is not None: attrs.append(f"airframes={u.airframes}")
                if u.hulls_remaining is not None: attrs.append(f"hulls={u.hulls_remaining}")
                if u.suppressed_pct > 0: attrs.append(f"sup={u.suppressed_pct:.0%}")
                rows.append(f"  [{label}/{cn}] {u.uid} ({u.type}) — {' '.join(attrs)} → action: {comp.what[:120]}")
        return "\n".join(rows) if rows else "  (no active components this phase)"

    def _opposing_target_inventory(self) -> str:
        """List likely target unit UIDs from each side, grouped by domain, so the
        adjudicator can assign outcomes to specific named units rather than vague refs."""
        rows: list[str] = []
        for side in ("RED", "BLUE"):
            rows.append(f"  {side} targetable units (alive, by domain):")
            for dom in ("strategic", "naval", "air", "ground", "sof"):
                ulist = [u for u in self.world.units.values()
                         if u.side == side and u.domain == dom and not u.destroyed]
                # Top 10 by strength
                ulist.sort(key=lambda u: -u.strength)
                shown = ", ".join(u.uid for u in ulist[:10])
                if shown:
                    rows.append(f"    [{dom}] {shown}" + (f" (+{len(ulist)-10} more)" if len(ulist) > 10 else ""))
        return "\n".join(rows)

    def resolve(
        self,
        phase: Phase,
        metrics: PhaseMetrics,
        red_action: TurnAction,
        blue_reaction: TurnAction,
        red_counter: Optional[TurnAction] = None,
    ) -> AgentResult:
        """Compute the phase resolution given both sides' actions."""
        scenario_block = _format_scenario_short(self.scenario)
        state_block = _format_phase_state(self.world, metrics, phase)
        max_units = 3 if not self.llm.cfg.use_responses_api else 12
        doctrine_chars = 900 if not self.llm.cfg.use_responses_api else 4500
        force_block_red = _format_force_summary(self.world, "RED", max_units_per_domain=max_units)
        force_block_blue = _format_force_summary(self.world, "BLUE", max_units_per_domain=max_units)
        doctrine_block, chunks = self._retrieve_doctrine(
            phase, self.world, metrics, max_chars=doctrine_chars
        )

        # Build action blocks
        def _action_block(label: str, ta: TurnAction) -> str:
            if ta is None: return ""
            lines = [f"=== {label} action ({ta.side}, phase {ta.phase}) ===",
                     f"  Overall intent: {ta.overall_intent}"]
            for cn, comp in ta.components().items():
                if comp is None: continue
                lines.append(f"  [{cn}] actor={comp.actor} — {comp.what}")
                if comp.why: lines.append(f"      why: {comp.why}")
                if comp.intended_effect: lines.append(f"      intent: {comp.intended_effect}")
                if comp.doctrine_cited: lines.append(f"      doctrine: {comp.doctrine_cited}")
            return "\n".join(lines)

        red_block = _action_block("RED", red_action)
        blue_block = _action_block("BLUE", blue_reaction)
        counter_block = _action_block("RED COUNTER", red_counter) if red_counter else ""

        # Engine-computed metrics block — MUST be echoed verbatim in the output
        engine_block = (
            f"=== ENGINE-COMPUTED METRICS (echo these verbatim — do not recompute) ===\n"
            f"  force_ratio_local       : {metrics.force_ratio_local}\n"
            f"  force_ratio_operational : {metrics.force_ratio_operational}\n"
            f"  ew_strength_red         : {metrics.ew_strength_red}\n"
            f"  ew_strength_blue        : {metrics.ew_strength_blue}\n"
            f"  blue_mines_remaining    : {metrics.blue_mines_remaining}\n"
            f"  advantage_label (from engine): {metrics.advantage_label}\n"
            f"  advantage_reason (from engine): {metrics.advantage_reason_brief}\n"
        )

        user_prompt = (
            f"{scenario_block}\n"
            f"{state_block}\n\n"
            f"{red_block}\n\n"
            f"{blue_block}\n\n"
            f"{counter_block}\n\n" if red_counter else f"{scenario_block}\n{state_block}\n\n{red_block}\n\n{blue_block}\n\n"
        )
        # Re-assemble cleanly
        user_prompt = (
            f"{scenario_block}\n"
            f"{state_block}\n\n"
            f"{engine_block}\n"
            f"{red_block}\n\n"
            f"{blue_block}\n\n"
            f"{counter_block}\n" if red_counter else
            f"{scenario_block}\n"
            f"{state_block}\n\n"
            f"{engine_block}\n"
            f"{red_block}\n\n"
            f"{blue_block}\n\n"
        )
        # Real-data injections (NOT hardcoded magic numbers — pulled from live world state)
        engagement_inventory = self._build_engagement_inventory(red_action, blue_reaction)
        target_inventory = self._opposing_target_inventory()
        n_red = sum(1 for c in red_action.components().values() if c is not None)
        n_blue = sum(1 for c in blue_reaction.components().values() if c is not None)
        n_components_active = n_red + n_blue
        # Expected outcome target: every active component is an engagement with
        # ~1.5 outcomes on average (attacker expenditure + defender casualty)
        n_target = max(4, int(round(n_components_active * 1.5)))

        user_prompt += (
            f"=== ENGAGEMENT INVENTORY (live state for each actor — assign outcomes against these) ===\n"
            f"{engagement_inventory}\n\n"
            f"=== TARGETABLE UNITS (real UIDs you can apply outcomes to) ===\n"
            f"{target_inventory}\n\n"
            f"=== Doctrine context (calibration coefficients, historical analogs) ===\n"
            f"{doctrine_block}\n\n"
            f"=== TASK ===\n"
            f"You are the neutral umpire. Resolve Phase {phase.step} ({phase.time_label} — {phase.phase_name_ar}).\n\n"
            f"**Outcome density target: ≥{n_target} unit_outcomes** (we have {n_red} Red + {n_blue} Blue "
            f"active components = {n_components_active} engagements; each engagement typically produces "
            f"both attacker expenditure + defender casualty = ~{n_target} outcomes total). "
            f"Producing fewer than this means you are missing engagements that historical doctrine "
            f"says occurred. Every engagement produces BOTH SIDES' outcomes — "
            f"produce BOTH:\n"
            f"  (a) ATTACKER EXPENDITURE — weapons consumed, airframes/hulls lost to intercept, "
            f"force losses during the strike (e.g. R-USV-23 expended, R-d3-14 lost 1 airframe to F-16 intercept).\n"
            f"      Valid status_change values for the schema: 'destroyed', 'damaged_partial', "
            f"'suppressed', 'delayed', 'expended', 'unchanged'. Use 'expended' for SSMs fired / "
            f"USVs spent / sorties flown — damage_pct = fraction of magazine/airframes consumed.\n"
            f"  (b) DEFENDER CASUALTIES — name SPECIFIC Blue UIDs from the targetable list above that were "
            f"hit/suppressed/delayed (e.g. B-NAV-COR took 2 hull losses from USV strike, B-9AD-HAWK1 lost "
            f"1 battery to HARM, B-552-ARTY suppressed 30%).\n"
            f"An empty defender outcome list when attacks occurred is wrong — find the targets.\n"
            f"Use historical calibration from the retrieved doctrine (USV→Black Sea 2024 25-30% survival × "
            f"60-70% hit; SEAD→Wild Weasel 10-15% AD attrition/wave + 5% strike loss/sortie; "
            f"mine clearance under fire→Wonsan 1950 50% MCM attrition + 5-12% capital ship loss per 100 mines; "
            f"ASCM→Falklands P(hit)=0.5, P(kill|hit)=0.4 frigate, 25% dud factor; "
            f"airborne drop→Cyprus 1974 5-8% loss when alerted).\n"
            f"Cite the specific calibration in cause_doctrine.\n\n"
            f"Output a PhaseResolution with:\n"
            f"  • combined_effect — 2-4 sentences narrating what happened across all active domains "
            f"this phase. Specific intercept counts, named units affected, doctrine cited.\n"
            f"  • unit_outcomes[] — one entry per affected unit. Real UIDs only. Each has "
            f"cause_actor (UID of the attacker), cause_what (1-line tactical description), and "
            f"cause_doctrine (specific calibration reference, e.g. 'Black Sea 2024 USV survival 25-30%').\n"
            f"  • step_advantage = {metrics.advantage_label}\n"
            f"  • advantage_reason — 1-2 sentences citing doctrine + the force ratio\n"
            f"  • Echo verbatim: force_ratio_local={metrics.force_ratio_local}, "
            f"force_ratio_operational={metrics.force_ratio_operational}, "
            f"mines_remaining={metrics.blue_mines_remaining}, "
            f"ew_strength_red={metrics.ew_strength_red}, ew_strength_blue={metrics.ew_strength_blue}.\n\n"
            f"Return strict JSON matching the PhaseResolution schema."
        )

        # Adjudicator can reference units on either side, so pass combined OOB UIDs
        all_uids = {u.uid for u in self.world.units.values()}
        validation_context = {
            "all_uids": all_uids,
            "phase": phase.step,
            "metrics": {
                "phase": metrics.phase,
                "force_ratio_local": metrics.force_ratio_local,
                "force_ratio_operational": metrics.force_ratio_operational,
                "blue_mines_remaining": metrics.blue_mines_remaining,
                "ew_strength_red": metrics.ew_strength_red,
                "ew_strength_blue": metrics.ew_strength_blue,
                "advantage_label": metrics.advantage_label,
            },
        }
        out = self._call_llm(user_prompt, tag=f"adjudicator_resolve_phase{phase.step:02d}",
                              max_output_tokens=5000,
                              validation_context=validation_context)

        # Defensive: enforce the engine metrics on the output (the LLM MIGHT alter them)
        if isinstance(out, PhaseResolution):
            out.phase = phase.step
            out.force_ratio_local = metrics.force_ratio_local
            out.force_ratio_operational = metrics.force_ratio_operational
            out.mines_remaining = metrics.blue_mines_remaining
            out.ew_strength_red = metrics.ew_strength_red
            out.ew_strength_blue = metrics.ew_strength_blue
            out.step_advantage = metrics.advantage_label

        return AgentResult(
            side_or_role="ADJUDICATOR", phase=phase.step, output=out,
            retrieved_chunks=chunks, prompt_user=user_prompt,
        )
