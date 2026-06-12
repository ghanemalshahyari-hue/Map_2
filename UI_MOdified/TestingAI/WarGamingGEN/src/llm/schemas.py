"""
schemas.py — Pydantic models for agent inputs/outputs.

These are the strict JSON contracts between the LLM agents and the rest of
the system. Every LLM call validates its output against one of these
models — invalid output triggers a retry with feedback.
"""
from __future__ import annotations
from typing import Literal, Optional, Any
from pydantic import BaseModel, Field, field_validator, model_validator, ValidationInfo


# ============================================================================
# Components
# ============================================================================

ComponentName = Literal[
    "strategic",   # SSM, strategic strike
    "maritime",    # naval surface, subs, ASW
    "air",         # fighters, strike, AWACS, helos
    "mines",       # mine warfare (laying + clearance)
    "usv_uav",     # explosive boats + kamikaze UAVs
    "sof",         # special operations / heliborne envelopment
    "land",        # ground maneuver
    "ew",          # electronic warfare
]

SideName = Literal["RED", "BLUE"]


# ============================================================================
# Action / Reaction
# ============================================================================

class ComponentAction(BaseModel):
    """One side's action in one component during one phase."""
    actor: str = Field(..., description="Specific named unit (UID from OOB) acting, e.g. 'R-4MID-41' or 'B-72-AD'")
    what: str = Field(..., description="What this unit is doing this phase. 1-2 sentences. Arabic OK; named units in Latin OK.")
    why: str = Field(..., description="Doctrinal reasoning + cited doctrine excerpt(s). 1-2 sentences.")
    intended_effect: str = Field(..., description="What success would look like. 1 sentence.")
    doctrine_cited: list[str] = Field(default_factory=list, description="Specific doctrine refs, e.g. 'FM 3-90 §5-23', 'AJP-3.1 Ed B'")


class TurnAction(BaseModel):
    """A side's full turn output — actions across all 8 components."""
    # phase + side are LLM-optional; the agent overwrites them after validation.
    # We give them lenient defaults so a missing key doesn't fail validation.
    phase: int = Field(default=0, ge=0, le=20)
    side: SideName = "RED"
    # Each component is optional — None means "no activity this phase"
    strategic: Optional[ComponentAction] = None
    maritime: Optional[ComponentAction] = None
    air: Optional[ComponentAction] = None
    mines: Optional[ComponentAction] = None
    usv_uav: Optional[ComponentAction] = None
    sof: Optional[ComponentAction] = None
    land: Optional[ComponentAction] = None
    ew: Optional[ComponentAction] = None
    overall_intent: str = Field(..., description="2-3 sentences explaining the side's overall intent this phase.")

    @model_validator(mode="before")
    @classmethod
    def _flip_empty_components_to_none(cls, data: Any) -> Any:
        """LLMs often return {actor: null, what: null, ...} for inactive
        components instead of just null. Flip those empties to None so
        the Optional[ComponentAction] field accepts them."""
        if not isinstance(data, dict): return data
        for fld in ("strategic","maritime","air","mines","usv_uav","sof","land","ew"):
            v = data.get(fld)
            if isinstance(v, dict):
                # If actor is missing/None and what is missing/None, treat the whole component as inactive
                actor = v.get("actor")
                what = v.get("what")
                if (actor is None or actor == "") and (what is None or what == ""):
                    data[fld] = None
        return data

    @model_validator(mode="after")
    def _validate_actor_uids_against_oob(self, info: ValidationInfo) -> "TurnAction":
        """When the validation context provides 'side_uids', every component
        actor UID must be in that set. Catches invented/friendly-name UIDs
        like 'B-72-AD' instead of the parsed OOB UID.

        Context is opt-in — schemas without context skip this check.
        """
        ctx = info.context or {}
        side_uids = ctx.get("side_uids")
        if not side_uids:
            return self
        bad: list[tuple[str, str]] = []
        for cn in ("strategic","maritime","air","mines","usv_uav","sof","land","ew"):
            c = getattr(self, cn)
            if c is None or not c.actor:
                continue
            if c.actor not in side_uids:
                bad.append((cn, c.actor))
        if bad:
            examples = list(sorted(side_uids))[:8]
            bad_str = ", ".join(f"[{cn}]={actor!r}" for cn, actor in bad)
            raise ValueError(
                f"Invalid actor UID(s) for side={self.side}: {bad_str}. "
                f"These UIDs are NOT in the {self.side} OOB. Use only real UIDs "
                f"from the force block in the user prompt. "
                f"Examples of valid UIDs: {examples}"
            )
        return self

    @model_validator(mode="after")
    def _require_at_least_one_component(self) -> "TurnAction":
        """A side that states an active overall_intent must have at least one
        component populated — either an active engagement OR a documented hold.

        Empty intent + all-null components → no-op phase, allowed.
        Active intent + all-null components → the LLM stated a plan but didn't
        name any acting/holding units. Reject so the client retries with
        feedback, per the explicit-hold rule.
        """
        n_active = sum(1 for c in [self.strategic, self.maritime, self.air,
                                    self.mines, self.usv_uav, self.sof,
                                    self.land, self.ew] if c is not None)
        if n_active == 0:
            intent = (self.overall_intent or "").strip().lower()
            # Empty intent or explicit "no engagement" → fine
            if len(intent) < 20:
                return self
            # If intent explicitly says no engagement, allow it
            no_op_markers = (
                "no kinetic engagement", "no engagement this phase",
                "forces in reserve", "no activity", "pause operations",
            )
            if any(m in intent for m in no_op_markers):
                return self
            raise ValueError(
                f"TurnAction has overall_intent describing activity but "
                f"ZERO components populated. If you genuinely intend no action, "
                f"set overall_intent to 'No kinetic engagement — forces in reserve' "
                f"and populate at least one component as an explicit hold "
                f"(e.g. land = {{actor: <a real UID>, what: 'Held position — "
                f"<doctrinal reason>', ...}}). Active intent + all-null components "
                f"is invalid output."
            )
        return self

    def components(self) -> dict[str, Optional[ComponentAction]]:
        """Iterate components by name."""
        return {
            "strategic": self.strategic, "maritime": self.maritime,
            "air": self.air, "mines": self.mines, "usv_uav": self.usv_uav,
            "sof": self.sof, "land": self.land, "ew": self.ew,
        }


# ============================================================================
# Adjudicator output
# ============================================================================

StatusChange = Literal[
    "destroyed",         # full kill
    "damaged_partial",   # partial — uses damage_pct
    "suppressed",        # combat-effective but pinned
    "delayed",           # arrival/movement slowed
    "expended",          # munitions/sorties consumed (SSMs fired, USVs spent, sorties flown) — damage_pct = fraction of magazine/airframes used
    "unchanged",         # no change
]


class UnitOutcome(BaseModel):
    """One unit's outcome from one phase, decided by the adjudicator."""
    unit_uid: str = Field(..., description="UID of the unit affected")
    status_change: StatusChange
    damage_pct: float = Field(0.0, ge=0.0, le=1.0, description="0.0-1.0; required when status_change=damaged_partial")
    cause_actor: str = Field(..., description="UID of the actor that caused this outcome")
    cause_what: str = Field(..., description="Short tactical description of the cause")
    cause_doctrine: str = Field("", description="Doctrinal justification + historical calibration")

    @field_validator("damage_pct")
    @classmethod
    def _check_damage_pct(cls, v: float, info) -> float:
        return v


class PhaseResolution(BaseModel):
    """The adjudicator's full output for one phase."""
    phase: int = Field(..., ge=0, le=20)
    combined_effect: str = Field(..., description="2-3 sentence narrative summarizing what happened this phase across all domains.")
    unit_outcomes: list[UnitOutcome] = Field(default_factory=list, description="Specific unit-by-unit outcomes with causes.")
    step_advantage: Literal["RED_ADV", "CONTESTED", "BLUE_ADV"]
    advantage_reason: str = Field(..., description="Why this advantage call. Cite the force ratio + doctrine.")

    # The adjudicator MUST echo these (computed by the engine) — do not recompute.
    force_ratio_local: float = Field(..., description="From engine. Echo, don't compute.")
    force_ratio_operational: float = Field(..., description="From engine. Echo, don't compute.")
    mines_remaining: int = Field(..., description="From engine.")
    ew_strength_red: float = Field(..., ge=0.0, le=1.0)
    ew_strength_blue: float = Field(..., ge=0.0, le=1.0)

    @model_validator(mode="after")
    def _validate_outcome_uids_against_oob(self, info: ValidationInfo) -> "PhaseResolution":
        """When the validation context provides 'all_uids' (combined Red+Blue
        OOB), every unit_outcome.unit_uid and cause_actor must be a real UID.
        Catches invented names in adjudicator output."""
        ctx = info.context or {}
        all_uids = ctx.get("all_uids")
        if not all_uids:
            return self
        bad_targets: list[str] = []
        bad_causes: list[str] = []
        for o in self.unit_outcomes:
            if o.unit_uid and o.unit_uid not in all_uids:
                bad_targets.append(o.unit_uid)
            if o.cause_actor and o.cause_actor not in all_uids:
                bad_causes.append(o.cause_actor)
        if bad_targets or bad_causes:
            ex = list(sorted(all_uids))[:8]
            msg = []
            if bad_targets:
                msg.append(f"unknown target UIDs in unit_outcomes: {bad_targets[:5]}")
            if bad_causes:
                msg.append(f"unknown cause_actor UIDs: {bad_causes[:5]}")
            raise ValueError(
                f"{' AND '.join(msg)}. These UIDs are NOT in the combined OOB. "
                f"Use only real UIDs from the force blocks or the TARGETABLE UNITS "
                f"list in the user prompt. Examples of valid UIDs: {ex}"
            )
        return self


# ============================================================================
# Output to disk (the matrix row)
# ============================================================================

class ScheduleRow(BaseModel):
    """One row of wargameschedule.csv. Built from agents' output + engine state."""
    phase: int
    phase_time_label: str               # e.g. "D-7", "D+24h"
    phase_name_ar: str
    component: str                      # one of ComponentName
    red_action: str
    red_why: str
    blue_action: str
    blue_why: str
    combined_effect: str
    red_inventory: str
    red_cum_losses: str
    blue_inventory: str
    blue_cum_losses: str
    red_ammo: str
    blue_ammo: str
