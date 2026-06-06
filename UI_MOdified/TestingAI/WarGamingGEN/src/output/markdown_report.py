"""
markdown_report.py — produces the human-readable narrative report.

Per-phase sections with:
  • Scene-setter (adjudicator's opener)
  • Engine metrics (force ratio, EW, mines)
  • Red intent + per-component actions
  • Blue intent + per-component reactions
  • Combined effect (narrative)
  • Unit-by-unit outcomes (real UIDs)
  • Operational state after the phase

This is the .docx replacement (Markdown instead of Word). Scenario-portable.
"""
from __future__ import annotations
from pathlib import Path
from typing import Iterable

from ..orchestrator import PhaseRecord


COMPONENTS = ("strategic", "maritime", "air", "mines", "usv_uav", "sof", "land", "ew")


# ============================================================================
# Public entry
# ============================================================================

def write_markdown_report(records: list[PhaseRecord], out_path: Path, operation_name: str) -> int:
    """Write the narrative report. Returns total character count."""
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    md = _build_markdown(records, operation_name)
    out_path.write_text(md, encoding="utf-8")
    return len(md)


# ============================================================================
# Builders
# ============================================================================

def _build_markdown(records: list[PhaseRecord], operation_name: str) -> str:
    parts: list[str] = []

    # Header
    parts.append(f"# Wargame Narrative — {operation_name}\n")
    parts.append(_executive_summary(records))
    parts.append("\n---\n")
    parts.append(_force_ratio_table(records))
    parts.append("\n---\n")

    # Per-phase sections
    for rec in records:
        parts.append(_phase_section(rec))

    parts.append("\n---\n")
    parts.append(_final_summary(records))

    return "\n".join(parts)


def _executive_summary(records: list[PhaseRecord]) -> str:
    if not records:
        return "*No phases were run.*\n"
    final = records[-1]
    n_outcomes = sum(len(r.resolution.get("unit_outcomes", [])) for r in records)
    adv_calls = [r.resolution.get("step_advantage", "") for r in records]
    red_advs = adv_calls.count("RED_ADV")
    contested = adv_calls.count("CONTESTED")
    blue_advs = adv_calls.count("BLUE_ADV")
    final_call = adv_calls[-1] if adv_calls else "unknown"

    return (
        "## Executive summary\n\n"
        f"- **Phases run**: {len(records)} (steps {records[0].phase}–{final.phase})\n"
        f"- **Total adjudicated unit outcomes**: {n_outcomes}\n"
        f"- **Phase-level advantage calls**: RED_ADV={red_advs}, CONTESTED={contested}, BLUE_ADV={blue_advs}\n"
        f"- **Final phase advantage**: **{final_call}**\n"
        f"- **Final cumulative losses**: Red={final.cum_losses_red}, Blue={final.cum_losses_blue}\n"
    )


def _force_ratio_table(records: list[PhaseRecord]) -> str:
    lines = [
        "## Force-ratio progression",
        "",
        "| Phase | Time | Kind | FR local | FR op | Advantage | Red losses (cum) | Blue losses (cum) |",
        "|------:|:-----|:-----|---------:|------:|:----------|-----------------:|------------------:|",
    ]
    for r in records:
        m = r.metrics_before
        lines.append(
            f"| {r.phase} | {r.time_label} | {r.kind} | "
            f"{m.get('force_ratio_local')}:1 | {m.get('force_ratio_operational')}:1 | "
            f"{r.resolution.get('step_advantage', '—')} | "
            f"{r.cum_losses_red} | {r.cum_losses_blue} |"
        )
    return "\n".join(lines) + "\n"


def _phase_section(rec: PhaseRecord) -> str:
    parts: list[str] = []
    parts.append(f"\n## Phase {rec.phase} — {rec.time_label} — {rec.phase_name_ar}\n")
    parts.append(f"*Kind:* `{rec.kind}` &nbsp; *Phase line:* {rec.phase_line_km} km from coast\n")

    # Scene setter
    parts.append(f"\n**Scene.** {rec.scene}\n")

    # Engine metrics
    m = rec.metrics_before
    parts.append("\n**Engine metrics (before this phase resolved).**")
    parts.append(
        f"- Force ratio (local / operational): **{m.get('force_ratio_local')}:1 / "
        f"{m.get('force_ratio_operational')}:1**\n"
        f"- Engine call: **{m.get('advantage_label')}** — {m.get('advantage_reason_brief')}\n"
        f"- EW strength: Red {m.get('ew_strength_red'):.2f} / Blue {m.get('ew_strength_blue'):.2f}\n"
        f"- Sea mines remaining: {m.get('blue_mines_remaining')}\n"
    )

    # Red intent + components
    parts.append(f"\n**Red intent.** {rec.red_action.get('overall_intent', '')}\n")
    red_lines = _component_table(rec.red_action)
    if red_lines:
        parts.append("\n**Red actions (per component):**\n")
        parts.append("\n".join(red_lines))
        parts.append("")

    # Blue intent + reactions
    parts.append(f"\n**Blue intent.** {rec.blue_reaction.get('overall_intent', '')}\n")
    blue_lines = _component_table(rec.blue_reaction)
    if blue_lines:
        parts.append("\n**Blue reactions (per component):**\n")
        parts.append("\n".join(blue_lines))
        parts.append("")

    # Combined effect (adjudicator narration)
    res = rec.resolution
    parts.append(f"\n**Combined effect.** {res.get('combined_effect', '')}\n")
    parts.append(
        f"\n**Adjudicator advantage call.** **{res.get('step_advantage')}** — "
        f"{res.get('advantage_reason', '')}\n"
    )

    # Unit outcomes
    outcomes = res.get("unit_outcomes", [])
    if outcomes:
        parts.append("\n**Unit-by-unit outcomes:**\n")
        parts.append("| Unit (UID) | Status | Damage | Cause | Doctrine |")
        parts.append("|:-----------|:-------|------:|:------|:---------|")
        for u in outcomes:
            dmg = u.get("damage_pct", 0.0) or 0.0
            parts.append(
                f"| `{u.get('unit_uid')}` | {u.get('status_change')} | {dmg:.0%} | "
                f"{u.get('cause_actor', '?')} — {u.get('cause_what', '')} | "
                f"{u.get('cause_doctrine', '')} |"
            )
        parts.append("")

    # Operational state after
    snap = rec.snapshot_after
    parts.append(
        f"\n**State after this phase.** Red alive {snap.get('red_alive')} / "
        f"Blue alive {snap.get('blue_alive')}. "
        f"Red power total {snap.get('red_power_total')} / "
        f"Blue power total {snap.get('blue_power_total')}. "
        f"Mines remaining {snap.get('blue_mines_remaining')}. "
        f"Cum losses to date: Red {rec.cum_losses_red}, Blue {rec.cum_losses_blue}.\n"
    )

    return "\n".join(parts)


def _component_table(action: dict) -> list[str]:
    """Render the 8-component breakdown for one side as Markdown bullets."""
    lines = []
    for comp in COMPONENTS:
        c = action.get(comp)
        if c is None:
            continue
        actor = c.get("actor", "")
        what = c.get("what", "")
        why = c.get("why", "")
        intent = c.get("intended_effect", "")
        cited = c.get("doctrine_cited") or []
        cited_str = f" *(refs: {', '.join(cited)})*" if cited else ""
        lines.append(
            f"- **[{comp}]** `{actor}` — {what}\n"
            f"    - *why:* {why}{cited_str}\n"
            f"    - *intended effect:* {intent}"
        )
    return lines


def _final_summary(records: list[PhaseRecord]) -> str:
    if not records:
        return ""
    final = records[-1]
    snap = final.snapshot_after
    # Cumulative losses by domain — pulled from inventory snapshots
    red_inv = final.inventory_red.get("by_domain", {})
    blue_inv = final.inventory_blue.get("by_domain", {})

    lines = ["## Final state at end of run\n",
             f"- Final phase: **{final.phase} — {final.time_label} — {final.phase_name_ar}**",
             f"- Final adjudicator call: **{final.resolution.get('step_advantage')}**",
             f"- Final force ratio (local): {final.metrics_before.get('force_ratio_local')}:1",
             f"- Total Red losses: **{final.cum_losses_red}** units",
             f"- Total Blue losses: **{final.cum_losses_blue}** units",
             f"- Red power remaining: {snap.get('red_power_total')}",
             f"- Blue power remaining: {snap.get('blue_power_total')}",
             "",
             "### Final inventory by domain",
             "",
             "| Domain | Red alive/total | Blue alive/total |",
             "|:-------|----------------:|-----------------:|"]
    for dom in ("strategic", "naval", "air", "ground", "sof"):
        r = red_inv.get(dom, {})
        b = blue_inv.get(dom, {})
        lines.append(
            f"| {dom} | {r.get('alive', 0)}/{r.get('total', 0)} | "
            f"{b.get('alive', 0)}/{b.get('total', 0)} |"
        )
    return "\n".join(lines) + "\n"
