"""graph/generation/time_math.py — pure time / date helpers.

Replaces the old generator's `cal()` (lines 174–208 of
``/Users/hextechkraken/Desktop/ToTransfer/New Text Document.txt``)
with clean, unit-testable functions. The old `cal()` had:

- ad-hoc HHMM modulo arithmetic that rolled days incorrectly on
  any minute boundary that crossed midnight
- hard-coded 420 minutes available time
- silent string coercions on already-numeric fields

All of that is replaced here with :func:`compute_allocation`, which
uses :class:`datetime.timedelta` for every duration and returns a
frozen :class:`PlanningAllocation` with explicit per-step start /
end datetimes.

Functions exposed for YAML ``kind: computed`` dispatch (every
callable here is a pure function — same inputs → same outputs, no
hidden state, no I/O):

- :func:`compute_allocation`              MDMP 1:3 rule + 30/20/30/20
- :func:`format_duration_hours`           minutes → "X ساعة"
- :func:`format_h_hour`                   datetime → "HH:MM يوم ..."
- :func:`format_h_hour_narrative_ar`      datetime → narrative sentence
- :func:`format_time_now`                 reporting_time → "الوقت الحالي: ..."
- :func:`format_gregorian_hijri_pair`     datetime → "dd month yyyy م / dd month yyyy هـ"

Hijri conversion ports the old code's
:func:`_gregorian_to_julian_day` + :func:`_julian_day_to_hijri` /
:func:`format_hijri_date` verbatim (they are approximations — the
old code acknowledges ~0.03-day-per-year drift, acceptable for
display only; per referencedoc 19 §1).

All Arabic month / weekday strings match the old generator's
wording so rendered output stays visually consistent across the
port.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta

__all__ = [
    "PlanningAllocation",
    "compute_allocation",
    "format_duration_hours",
    "format_h_hour",
    "format_h_hour_narrative_ar",
    "format_time_now",
    "format_gregorian_hijri_pair",
    "format_gregorian_date",
    "format_hijri_date",
    "gregorian_to_hijri",
]


# ------------------------------------------------------------- constants

# MDMP split: 1/3 for the commander, 2/3 for subordinate units.
# Inside the commander's planning slice, 30/20/30/20 across the four
# canonical MDMP steps (Receipt & Analysis → COA Development →
# COA Analysis & Comparison → Plan & Order Production).
# These percentages are doctrinal; not a knob.
_PLANNING_FRACTION = 1.0 / 3.0
_STEP_PERCENTAGES = (0.30, 0.20, 0.30, 0.20)

_STEP_ARABIC_NAMES = (
    "استلام وتحليل المهمة",
    "تطوير الأعمال الممكنة",
    "تحليل ومقارنة وقرار",
    "إعداد الخطة والأوامر",
)

_GREGORIAN_MONTHS_AR = (
    "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
    "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
)

_HIJRI_MONTHS_AR = (
    "محرم", "صفر", "ربيع الأول", "ربيع الثاني", "جمادى الأولى", "جمادى الثانية",
    "رجب", "شعبان", "رمضان", "شوال", "ذو القعدة", "ذو الحجة",
)


# ------------------------------------------------------------- allocation

@dataclass(frozen=True)
class PlanningAllocation:
    """Output of :func:`compute_allocation`.

    Exposes both the raw integer minutes (for arithmetic that the
    renderer may need — e.g. the 5-column `timeline_table` layout)
    and the Arabic-formatted display strings that the YAML
    ``output_field`` entries pull from (for ``numbered_fields``).
    """

    # ---- raw durations
    total_minutes: int
    planning_minutes: int                # ≈ total × 1/3
    subordinate_minutes: int             # total − planning_minutes
    step_minutes: tuple[int, int, int, int]   # step 1..4 minutes

    # ---- timeline
    reporting_time: datetime
    h_hour: datetime
    # step (start, end) datetimes; step_1 starts at reporting_time,
    # step_4 ends at (reporting_time + planning_minutes).
    step_bounds: tuple[tuple[datetime, datetime], ...]
    subordinate_window: tuple[datetime, datetime]  # (planning_end, h_hour)

    # ---- Arabic display strings (what YAML output_field picks up)
    planning_minutes_display: str
    subordinate_minutes_display: str
    step_1_display: str
    step_2_display: str
    step_3_display: str
    step_4_display: str

    # ---- structured rows for renderer `timeline_table` layout:
    # five columns — (activity, percentage, duration, start, end)
    table_rows_ar: tuple[tuple[str, str, str, str, str], ...]


def _arabic_percent(fraction: float) -> str:
    """Render ``0.30`` as ``"30%"`` (no trailing zeros)."""
    pct = round(fraction * 100)
    return f"{pct}%"


def _format_minutes_as_hours_ar(minutes: int | float) -> str:
    """Render a minute count as ``"N ساعة"`` with ≤2 decimals.

    Whole hours drop the decimal point entirely. "ساعة" is used for
    all counts (no singular/plural variant — matches the old code's
    examples in NewClasses.md).
    """
    hours = minutes / 60.0
    if abs(hours - round(hours)) < 1e-9:
        return f"{int(round(hours))} ساعة"
    text = f"{hours:.2f}".rstrip("0").rstrip(".")
    return f"{text} ساعة"


def _fmt_hm(dt: datetime) -> str:
    """Render datetime as zero-padded ``HH:MM`` in local time."""
    return dt.strftime("%H:%M")


def _fmt_gregorian_short_ar(dt: datetime) -> str:
    """Render ``dt`` as ``"DD month YYYY م"`` in Arabic."""
    return f"{dt.day} {_GREGORIAN_MONTHS_AR[dt.month - 1]} {dt.year} م"


def _fmt_datetime_ar(dt: datetime) -> str:
    """Render as ``"HH:MM يوم DD month YYYY م"``."""
    return f"{_fmt_hm(dt)} يوم {_fmt_gregorian_short_ar(dt)}"


def compute_allocation(
    total_minutes: int,
    h_hour: datetime | None = None,
    reporting_time: datetime | None = None,
) -> PlanningAllocation:
    """Compute the MDMP time allocation from a total-available window.

    Exactly one of ``h_hour`` or ``reporting_time`` must be given —
    the other is derived as ``h_hour - total_minutes`` or
    ``reporting_time + total_minutes``. Providing both is accepted
    and consistency is checked (within 1-minute tolerance to allow
    sub-minute drift in user input).

    Args:
        total_minutes: minutes available from the reporting time
            to H-Hour. Must be positive; zero or negative values
            raise ``ValueError`` — the 1:3 rule is undefined there.
        h_hour: mission start datetime (aware or naive — aware is
            preferred). Optional if ``reporting_time`` is given.
        reporting_time: "now" reference point. Optional if
            ``h_hour`` is given.

    Returns:
        A :class:`PlanningAllocation` with every step's minute count,
        datetime bounds, Arabic display string, and the
        5-column rows tuple used by the renderer's
        ``timeline_table`` layout.

    Raises:
        ValueError: on non-positive ``total_minutes`` or when both
            anchors are missing / inconsistent.
    """
    if total_minutes <= 0:
        raise ValueError(
            f"compute_allocation: total_minutes must be > 0 "
            f"(got {total_minutes!r})"
        )
    if h_hour is None and reporting_time is None:
        raise ValueError(
            "compute_allocation: pass h_hour or reporting_time "
            "(or both)"
        )

    window = timedelta(minutes=total_minutes)
    if reporting_time is None:
        reporting_time = h_hour - window  # type: ignore[operator]
    elif h_hour is None:
        h_hour = reporting_time + window
    else:
        drift = abs((h_hour - reporting_time) - window)
        if drift > timedelta(minutes=1):
            raise ValueError(
                f"compute_allocation: h_hour ({h_hour.isoformat()}) and "
                f"reporting_time ({reporting_time.isoformat()}) are "
                f"{drift} apart but total_minutes={total_minutes} implies "
                f"{window}. Fix the inputs so they agree."
            )

    # Planning slice (1/3 of the total) and subordinate slice (2/3).
    planning_minutes = int(round(total_minutes * _PLANNING_FRACTION))
    subordinate_minutes = total_minutes - planning_minutes

    # Four MDMP step durations (rounded minutes). The last step
    # absorbs any rounding drift so their sum exactly equals
    # planning_minutes, which avoids a 1-minute gap / overlap at
    # the step boundaries.
    raw_step_minutes = [int(round(planning_minutes * pct)) for pct in _STEP_PERCENTAGES]
    drift = planning_minutes - sum(raw_step_minutes)
    raw_step_minutes[-1] += drift
    step_minutes_tuple: tuple[int, int, int, int] = tuple(raw_step_minutes)  # type: ignore[assignment]

    # Compute step boundaries starting at reporting_time.
    cursor = reporting_time
    bounds: list[tuple[datetime, datetime]] = []
    for sm in step_minutes_tuple:
        step_end = cursor + timedelta(minutes=sm)
        bounds.append((cursor, step_end))
        cursor = step_end
    planning_end = cursor
    subordinate_window = (planning_end, h_hour)

    # Arabic display strings.
    planning_disp = (
        f"{_format_minutes_as_hours_ar(total_minutes)} ÷ 3 = "
        f"{_format_minutes_as_hours_ar(planning_minutes)}"
    )
    subordinate_disp = (
        f"{_format_minutes_as_hours_ar(total_minutes)} × 2/3 = "
        f"{_format_minutes_as_hours_ar(subordinate_minutes)}"
    )
    step_displays = tuple(
        f"{_format_minutes_as_hours_ar(planning_minutes)} × "
        f"{_arabic_percent(pct)} = {_format_minutes_as_hours_ar(sm)}"
        for pct, sm in zip(_STEP_PERCENTAGES, step_minutes_tuple)
    )

    # Five-column rows for timeline_table: (activity, %, duration, start, end)
    table_rows_ar = tuple(
        (
            name,
            _arabic_percent(pct),
            _format_minutes_as_hours_ar(sm),
            _fmt_datetime_ar(start),
            _fmt_datetime_ar(end),
        )
        for name, pct, sm, (start, end) in zip(
            _STEP_ARABIC_NAMES, _STEP_PERCENTAGES, step_minutes_tuple, bounds
        )
    )

    return PlanningAllocation(
        total_minutes=total_minutes,
        planning_minutes=planning_minutes,
        subordinate_minutes=subordinate_minutes,
        step_minutes=step_minutes_tuple,
        reporting_time=reporting_time,
        h_hour=h_hour,
        step_bounds=tuple(bounds),
        subordinate_window=subordinate_window,
        planning_minutes_display=planning_disp,
        subordinate_minutes_display=subordinate_disp,
        step_1_display=step_displays[0],
        step_2_display=step_displays[1],
        step_3_display=step_displays[2],
        step_4_display=step_displays[3],
        table_rows_ar=table_rows_ar,
    )


# ------------------------------------------------------------- formatters

def format_duration_hours(minutes: int) -> str:
    """Render a minute count as an Arabic "N ساعة" string."""
    return _format_minutes_as_hours_ar(minutes)


def format_h_hour(when: datetime, time_zone: str | None = None) -> str:
    """Render H-Hour as ``"HH:MM يوم DD month YYYY م (TZ)"`` in Arabic."""
    base = _fmt_datetime_ar(when)
    return f"{base} ({time_zone})" if time_zone else base


def format_h_hour_narrative_ar(when: datetime, time_zone: str | None = None) -> str:
    """Render the OPORD ``date_time`` / ``execution_timeline`` sentence.

    Example output::

        "تبدأ العملية الساعة 07:00 يوم 1 مايو 2026 م (UTC+3)"
    """
    time_part = _fmt_hm(when)
    date_part = _fmt_gregorian_short_ar(when)
    tz = f" ({time_zone})" if time_zone else ""
    return f"تبدأ العملية الساعة {time_part} يوم {date_part}{tz}"


def format_time_now(reporting_time: datetime, time_zone: str | None = None) -> str:
    """Render the reporting-time value only (no label).

    The surrounding label ("الوقت الحالي") comes from the YAML
    ``label_ar`` on the field; ``numbered_fields`` layout prefixes
    the value with ``{label_ar}: ``. Returning the label inline
    would duplicate it.
    """
    tz = f" ({time_zone})" if time_zone else ""
    return f"{_fmt_datetime_ar(reporting_time)}{tz}"


def format_gregorian_hijri_pair(when: datetime) -> str:
    """Render ``"DD month YYYY م / DD month YYYY هـ"``."""
    greg = format_gregorian_date(when)
    hijri = format_hijri_date(gregorian_to_hijri(when))
    return f"{greg} / {hijri}"


# ------------------------------------------------------------- Hijri (ported verbatim)

def gregorian_to_hijri(when: datetime | date) -> tuple[int, int, int] | None:
    """Port of old code's ``gregorian_to_hijri``.

    Returns ``(day, month, year)`` as 1-based integers. Preserves
    the old code's behaviour including its acknowledged ~0.03-day-
    per-Hijri-year drift (acceptable for display per referencedoc
    19 §1 — never use for operational time math).
    """
    if when is None:
        return None
    if isinstance(when, datetime):
        when = when.date()
    jd = _gregorian_to_julian_day(when.year, when.month, when.day)
    return _julian_day_to_hijri(jd)


def _gregorian_to_julian_day(year: int, month: int, day: int) -> int:
    if month <= 2:
        year -= 1
        month += 12
    a = year // 100
    b = 2 - a + a // 4
    jd = int(365.25 * (year + 4716)) + int(30.6001 * (month + 1)) + day + b - 1524.5
    return int(jd)


def _julian_day_to_hijri(jd: int) -> tuple[int, int, int]:
    jd_epoch = 1948439.5
    days = jd - jd_epoch
    hijri_year = int(days / 354.36667) + 1
    remaining_days = days - ((hijri_year - 1) * 354.36667)
    hijri_month = int(remaining_days / 29.5) + 1
    if hijri_month > 12:
        hijri_month = 12
    month_days = 0
    for m in range(1, hijri_month):
        month_days += 30 if m % 2 == 1 else 29
    if hijri_year % 30 in {2, 5, 7, 10, 13, 16, 18, 21, 24, 26, 29} and hijri_month == 12:
        month_days += 1
    hijri_day = int(remaining_days - month_days) + 1
    return (max(1, min(30, hijri_day)), max(1, min(12, hijri_month)), hijri_year)


def format_hijri_date(hijri_date: tuple[int, int, int] | None) -> str:
    """Port of old code's ``format_hijri_date``.

    Keeps the "جمادى" → "جم...ـ...ـادى" kashida-stretched form
    for both Jumada months (matches the old renderer byte-for-byte).
    """
    if not hijri_date:
        return ""
    day, month, year = hijri_date
    month_name = (
        "جمادى"
        if month in (5, 6)
        else (_HIJRI_MONTHS_AR[month - 1] if 1 <= month <= 12 else f"شهر {month}")
    )
    if month_name == "جمادى":
        month_name = "جم" + "ـ" * 8 + "ادى"
    return f"{day} {month_name} {year} هـ"


def format_gregorian_date(when: datetime | date | None) -> str:
    """Port of old code's ``format_gregorian_date``.

    Keeps the "نوفمبر" → "نوفم...ـ...ـبر" kashida-stretched form
    (matches the old renderer byte-for-byte).
    """
    if when is None:
        return ""
    if isinstance(when, datetime):
        when = when.date()
    if not (1 <= when.month <= 12):
        month_name = f"شهر {when.month}"
    else:
        month_name = _GREGORIAN_MONTHS_AR[when.month - 1]
    if month_name == "نوفمبر":
        month_name = "نوفم" + "ـ" * 8 + "بر"
    return f"{when.day} {month_name} {when.year} م"


# ---------------------------------------------------------------- standalone
if __name__ == "__main__":
    # Quick smoke — round-trip the sample input's h_hour through compute_allocation.
    import json
    import sys
    from pathlib import Path

    sample = Path(__file__).resolve().parent.parent.parent / "data" / "phase3_inputs.example.json"
    raw = json.loads(sample.read_text(encoding="utf-8"))
    h = datetime.fromisoformat(raw["timing"]["h_hour_gregorian"])
    r = datetime.fromisoformat(raw["timing"]["reporting_date_gregorian"])
    total = int(raw["timing"]["total_available_minutes"])
    alloc = compute_allocation(total, h_hour=h, reporting_time=r)
    print(f"total            = {alloc.total_minutes} min ({_format_minutes_as_hours_ar(alloc.total_minutes)})")
    print(f"planning (1/3)   = {alloc.planning_minutes} min → {alloc.planning_minutes_display}")
    print(f"subordinate      = {alloc.subordinate_minutes} min → {alloc.subordinate_minutes_display}")
    for i, (start, end) in enumerate(alloc.step_bounds, 1):
        disp = getattr(alloc, f"step_{i}_display")
        print(f"step {i}           : {start.isoformat()} → {end.isoformat()}  ({disp})")
    print(f"subordinate window: {alloc.subordinate_window[0].isoformat()} → {alloc.subordinate_window[1].isoformat()}")
    print()
    print(f"format_h_hour                 = {format_h_hour(h, raw['timing']['time_zone'])}")
    print(f"format_h_hour_narrative_ar    = {format_h_hour_narrative_ar(h, raw['timing']['time_zone'])}")
    print(f"format_time_now               = {format_time_now(r, raw['timing']['time_zone'])}")
    print(f"format_gregorian_hijri_pair   = {format_gregorian_hijri_pair(r)}")
    sys.exit(0)
