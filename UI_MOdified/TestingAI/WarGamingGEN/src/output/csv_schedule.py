"""
csv_schedule.py — writes wargameschedule.csv

One row per (phase, component) where AT LEAST one side has an active
component action. Columns match the ScheduleRow Pydantic schema:

    phase, phase_time_label, phase_name_ar, component,
    red_action, red_why, blue_action, blue_why, combined_effect,
    red_inventory, red_cum_losses, blue_inventory, blue_cum_losses,
    red_ammo, blue_ammo

This is the machine-readable spreadsheet replacement for the .xlsx
that Claude3 produced.  Scenario-portable: no Libya constants here.
"""
from __future__ import annotations
import csv
from pathlib import Path
from typing import Iterable

from ..orchestrator import PhaseRecord


# 8 components, in canonical order
COMPONENTS = ("strategic", "maritime", "air", "mines", "usv_uav", "sof", "land", "ew")


# ============================================================================
# Public entry
# ============================================================================

def write_schedule_csv(records: Iterable[PhaseRecord], out_path: Path) -> int:
    """Write the schedule CSV. Returns row count."""
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    rows = list(_build_rows(records))
    with out_path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=[
            "phase", "phase_time_label", "phase_name_ar", "component",
            "red_action", "red_why", "blue_action", "blue_why", "combined_effect",
            "red_inventory", "red_cum_losses", "blue_inventory", "blue_cum_losses",
            "red_ammo", "blue_ammo",
        ])
        w.writeheader()
        for r in rows:
            w.writerow(r)
    return len(rows)


# ============================================================================
# Row construction
# ============================================================================

def _build_rows(records: Iterable[PhaseRecord]) -> Iterable[dict]:
    """One row per (phase, component) where at least one side is active.
    The combined_effect appears in the first emitted row for the phase
    (so it isn't repeated 8x). Inventory / loss / ammo cells repeat
    across all rows of one phase — they're per-phase snapshots."""
    for rec in records:
        red_comps = rec.red_action.get("strategic"), rec.red_action.get("maritime"), \
                    rec.red_action.get("air"), rec.red_action.get("mines"), \
                    rec.red_action.get("usv_uav"), rec.red_action.get("sof"), \
                    rec.red_action.get("land"), rec.red_action.get("ew")
        red_map = dict(zip(COMPONENTS, red_comps))
        blue_comps = rec.blue_reaction.get("strategic"), rec.blue_reaction.get("maritime"), \
                     rec.blue_reaction.get("air"), rec.blue_reaction.get("mines"), \
                     rec.blue_reaction.get("usv_uav"), rec.blue_reaction.get("sof"), \
                     rec.blue_reaction.get("land"), rec.blue_reaction.get("ew")
        blue_map = dict(zip(COMPONENTS, blue_comps))

        red_inv_str = _format_inventory(rec.inventory_red)
        blue_inv_str = _format_inventory(rec.inventory_blue)
        red_ammo_str = _format_ammo(rec.ammo_red)
        blue_ammo_str = _format_ammo(rec.ammo_blue)
        combined_effect = rec.resolution.get("combined_effect", "")

        first_emitted_for_phase = True
        for comp in COMPONENTS:
            r = red_map.get(comp)
            b = blue_map.get(comp)
            # Skip components where BOTH sides are inactive — keeps CSV terse
            if r is None and b is None:
                continue
            yield {
                "phase": rec.phase,
                "phase_time_label": rec.time_label,
                "phase_name_ar": rec.phase_name_ar,
                "component": comp,
                "red_action": _action_cell(r),
                "red_why": _why_cell(r),
                "blue_action": _action_cell(b),
                "blue_why": _why_cell(b),
                # Show combined_effect once per phase (first row), blank thereafter
                # — readers can re-fill it via groupby if they want.
                "combined_effect": combined_effect if first_emitted_for_phase else "",
                "red_inventory": red_inv_str,
                "red_cum_losses": rec.cum_losses_red,
                "blue_inventory": blue_inv_str,
                "blue_cum_losses": rec.cum_losses_blue,
                "red_ammo": red_ammo_str,
                "blue_ammo": blue_ammo_str,
            }
            first_emitted_for_phase = False

        # If a phase has zero active components (very rare), still emit a single
        # placeholder row so the phase shows up in the CSV.
        if first_emitted_for_phase:
            yield {
                "phase": rec.phase,
                "phase_time_label": rec.time_label,
                "phase_name_ar": rec.phase_name_ar,
                "component": "(none)",
                "red_action": "",
                "red_why": "",
                "blue_action": "",
                "blue_why": "",
                "combined_effect": combined_effect,
                "red_inventory": red_inv_str,
                "red_cum_losses": rec.cum_losses_red,
                "blue_inventory": blue_inv_str,
                "blue_cum_losses": rec.cum_losses_blue,
                "red_ammo": red_ammo_str,
                "blue_ammo": blue_ammo_str,
            }


# ============================================================================
# Cell formatters
# ============================================================================

def _action_cell(comp: dict | None) -> str:
    """Format a ComponentAction dict as 'actor: what'."""
    if comp is None: return ""
    actor = comp.get("actor", "") or ""
    what = comp.get("what", "") or ""
    return f"{actor}: {what}" if actor else what


def _why_cell(comp: dict | None) -> str:
    """Format the 'why' + doctrine citations."""
    if comp is None: return ""
    why = comp.get("why", "") or ""
    cited = comp.get("doctrine_cited") or []
    if cited:
        why = f"{why} [refs: {', '.join(cited)}]"
    return why.strip()


def _format_inventory(inv: dict) -> str:
    """E.g. 'strategic 1/1, naval 8/10, air 11/12, ground 70/84, sof 2/2'."""
    if not inv: return ""
    parts = []
    by_dom = inv.get("by_domain", {})
    for dom in ("strategic", "naval", "air", "ground", "sof"):
        d = by_dom.get(dom, {})
        alive = d.get("alive", 0)
        total = d.get("total", 0)
        if total > 0:
            parts.append(f"{dom} {alive}/{total}")
    return ", ".join(parts)


def _format_ammo(ammo: dict) -> str:
    """E.g. 'magazines=4200, airframes=58, hulls=12'."""
    if not ammo: return ""
    parts = []
    if ammo.get("magazines_remaining"):
        parts.append(f"magazines={ammo['magazines_remaining']}")
    if ammo.get("airframes_remaining"):
        parts.append(f"airframes={ammo['airframes_remaining']}")
    if ammo.get("hulls_remaining"):
        parts.append(f"hulls={ammo['hulls_remaining']}")
    return ", ".join(parts)
