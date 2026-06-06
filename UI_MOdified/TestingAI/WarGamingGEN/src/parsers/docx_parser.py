"""
docx_parser.py — read Red/Blue force OOB from Arabic .docx files.

The DOCX files are structured Arabic outlines (parent formation → brigade →
battalion → company, with bullet markers like أ. (1) (أ) etc). The parser
walks the paragraph stream, tracks indent depth, and builds a tree of Pydantic
ForceUnit objects.

Design:
  - Deterministic. No LLM. Same input → same output, always.
  - Tolerant. Skips paragraphs without recognizable structure.
  - Flat output. Returns a flat list of ForceUnit; parent/child links are
    expressed by `parent_uid` and `depth`. The orchestrator can rebuild a
    tree if needed.
"""
from __future__ import annotations
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Optional
from docx import Document
from docx.oxml.ns import qn
from pydantic import BaseModel, Field


# ============================================================================
# Pydantic models
# ============================================================================

class ForceUnit(BaseModel):
    """One unit in an OOB."""
    uid: str = Field(..., description="Unique identifier within a side, e.g. 'R-4MID-41' or 'B-72-AD'")
    side: str = Field(..., description="'RED' or 'BLUE'")
    name_ar: str = Field(..., description="Arabic name as it appears in the DOCX")
    name_en: str = Field("", description="English shorthand (parser-generated)")
    echelon: str = Field("", description="div | bde | bn | coy | sqn | flot | unit")
    domain: str = Field("ground", description="ground | air | naval | sof | strategic")
    type: str = Field("", description="Subtype hint, e.g. 'mech_brigade', 'destroyer', 'fighter_ad'")
    parent_uid: Optional[str] = Field(None, description="UID of parent formation in the tree")
    depth: int = Field(0, ge=0, le=8, description="Outline depth from the DOCX")
    counts: dict[str, int] = Field(default_factory=dict, description="Extracted numeric counts (e.g. {'aircraft': 12, 'launchers': 36})")
    raw_line: str = Field("", description="Original DOCX paragraph text for audit")


class ForceOOB(BaseModel):
    """A whole side's order of battle."""
    side: str = Field(..., description="'RED' or 'BLUE'")
    source_file: str = Field(..., description="Path to the source .docx")
    units: list[ForceUnit] = Field(default_factory=list)

    def count_by_echelon(self) -> dict[str, int]:
        out: dict[str, int] = {}
        for u in self.units:
            out[u.echelon] = out.get(u.echelon, 0) + 1
        return out

    def count_by_domain(self) -> dict[str, int]:
        out: dict[str, int] = {}
        for u in self.units:
            out[u.domain] = out.get(u.domain, 0) + 1
        return out


# ============================================================================
# Bullet pattern → depth mapping
# ============================================================================
# Arabic OOB DOCX uses these markers, in order of nesting:
#
#   أ. ب. جـ. د. هـ.        (depth 0 — top-level branches of a side)
#   (1) (2) (3)               (depth 1 — first sub-list)
#   (أ) (ب) (جـ) (د)         (depth 2)
#   (أ أ) (ب ب) (جـ جـ)      (depth 3)
#
# Some docs also use ١. ٢. or ASCII 1. 2.

# Top-level
RE_DEPTH_0_AR = re.compile(r"^\s*([أبجدهوزحطيك])\s*[.\)]\s*(.+)$")   # أ. — letter then dot
RE_DEPTH_0_AR_LONG = re.compile(r"^\s*(جـ|هـ)\s*[.\)]\s*(.+)$")
# Numbers (1) (2) (3)
RE_DEPTH_1_NUM = re.compile(r"^\s*\((\d+)\)\s*(.+)$")
# Letters in parens (أ) (ب) (جـ)
RE_DEPTH_2_AR = re.compile(r"^\s*\(\s*([أبجدهوزحطيكلمنسعفصقرشتثخذضظغ]+)\s*\)\s*(.+)$")
# Doubled letters (أ أ) (ب ب)
RE_DEPTH_3_AR = re.compile(r"^\s*\(\s*([أبجدهوزحطيك])\s+\1\s*\)\s*(.+)$")
# Doubled letters with و prefix like (و و) or (وو)
RE_DEPTH_3_AR_VAR = re.compile(r"^\s*\(\s*([أبجدهوزحطيكلمن])\s*\1\s*\)\s*(.+)$")

NUMERIC_TRAIL = re.compile(r"(\d+)\s*(?:طائرة|قاذف|سرية|سرايا|سفينة|سفن|زورق|زوارق|كتيبة|كتائب|لواء|ألوية|فرقة|غواصة|غواصات|مدمرة|مدمرات|فرقاطة|فرقاطات|هوفر|طائرات|دبابة|دبابات|لغم|ألغام)")


# ============================================================================
# Domain + type classifiers (heuristic, no LLM)
# ============================================================================

def _classify(name_ar: str) -> tuple[str, str]:
    """Best-effort (domain, type) classification from Arabic name."""
    n = name_ar
    # Air
    if any(k in n for k in ["سرب", "السرب", "طائرات", "طائرة", "أف", "ميج", "ميراج", "رافال", "سوخوي", "F16", "F-16"]):
        if any(k in n for k in ["دفاع جوي"]): return ("air", "fighter_ad")
        if any(k in n for k in ["هجوم أرضي", "هجوم"]): return ("air", "strike")
        if any(k in n for k in ["مسيَّرة هجومية", "مسيرة هجومية"]): return ("air", "uav_attack")
        if any(k in n for k in ["مسيَّرة متفجرة", "مسيرة متفجرة"]): return ("air", "uav_kamikaze")
        if any(k in n for k in ["مسيَّرة", "مسيرة", "ISR", "استطلاع", "مراقبة"]): return ("air", "uav_isr")
        if any(k in n for k in ["إنذار مبكر", "AWACS"]): return ("air", "awacs")
        if any(k in n for k in ["تزود وقود", "تزود بالوقود"]): return ("air", "tanker")
        if any(k in n for k in ["نقل", "C-130", "C130", "سي 130"]): return ("air", "transport")
        if any(k in n for k in ["عمودية هجومية"]): return ("air", "attack_helo")
        if any(k in n for k in ["عمودية", "هلكوبتر"]): return ("air", "utility_helo")
        return ("air", "air_unit")
    # Naval
    if any(k in n for k in ["مدمر", "فرقاطة", "غواصة", "زورق صواريخ", "هوفر", "إبرار", "نقل تجاري", "بث ألغام", "كاسحة ألغام", "قانصة ألغام", "كورفيت", "إنزال", "ساحل", "بحري", "بحرية"]):
        if "مدمر" in n: return ("naval", "destroyer")
        if "فرقاطة" in n: return ("naval", "frigate")
        if "غواصة" in n: return ("naval", "submarine")
        if "زورق صواريخ" in n: return ("naval", "missile_boat")
        if "هوفر" in n: return ("naval", "hovercraft")
        if "إبرار" in n or "إنزال" in n: return ("naval", "landing_ship")
        if "بث ألغام" in n: return ("naval", "mine_layer")
        if "كاسحة" in n or "قانصة" in n: return ("naval", "mine_sweeper")
        if "كورفيت" in n: return ("naval", "corvette")
        if "ألغام بحرية" in n or "لغم بحري" in n: return ("naval", "sea_mines")
        return ("naval", "naval_unit")
    # USV
    if "مفخخ" in n or "USV" in n.upper():
        return ("naval", "usv_swarm")
    # SAM / AD
    if any(k in n for k in ["S-300", "S300", "اس 300", "هوك", "Hawk", "سام", "SAM"]):
        if "S-300" in n or "S300" in n or "اس 300" in n: return ("ground", "sam_s300")
        if "هوك" in n.lower() or "Hawk" in n: return ("ground", "sam_hawk")
        if "كتف" in n or "MANPADS" in n.upper(): return ("ground", "manpads")
        return ("ground", "sam_other")
    if "35مم" in n or "35 ملم" in n or "م/ط" in n or "ضد الطائرات" in n:
        return ("ground", "aaa")
    # Strategic
    if "صواريخ أرض/أرض" in n or "صواريخ أرض / أرض" in n or "SSM" in n.upper():
        return ("strategic", "ssm_brigade")
    # SOF
    if "العمليات الخاصة" in n or "SOF" in n.upper() or "21" in n and "عمليات" in n:
        return ("sof", "sof_bn")
    # Ground default
    if any(k in n for k in ["مدفعية", "ARTY"]):
        return ("ground", "artillery_bn" if "كتيبة" in n else "artillery_bde")
    if "راجمات" in n or "MRL" in n: return ("ground", "mrl_bn")
    if "م/د" in n or "ATGM" in n or "مضاد دبابات" in n: return ("ground", "atgm_bn")
    if "مدرع" in n or "دبابات" in n or "ARMORED" in n.upper():
        return ("ground", "armored_brigade" if "لواء" in n else "armored_unit")
    if "ميكانيكي" in n or "آلي" in n or "آلية" in n:
        if "فرقة" in n: return ("ground", "mech_inf_div")
        if "لواء" in n: return ("ground", "mech_brigade")
        if "كتيبة" in n: return ("ground", "mech_bn")
        if "سرية" in n: return ("ground", "mech_coy")
    if "مشاة" in n:
        if "لواء" in n: return ("ground", "inf_brigade")
        if "كتيبة" in n: return ("ground", "inf_bn")
    if "هندسة" in n: return ("ground", "engineer_bn")
    if "إشارة" in n or "اشارة" in n: return ("ground", "signal_bn")
    if "حرب إلكترونية" in n or "حرب الكترونية" in n or "تشويش" in n: return ("ground", "ew_bn")
    if "كيميائي" in n or "CBRN" in n.upper(): return ("ground", "chem_bn")
    if "استطلاع" in n: return ("ground", "recon_bn")
    if "خدمات" in n or "إمداد" in n or "تزويد" in n or "صيانة" in n or "طبية" in n: return ("ground", "logistics")
    if "شرطة عسكرية" in n: return ("ground", "mp_coy")
    if "رادار" in n: return ("ground", "radar")
    # Default
    return ("ground", "unknown")


def _echelon_from_text(name_ar: str) -> str:
    """Heuristic echelon from words in the Arabic name."""
    if "فرقة" in name_ar or "Division" in name_ar.lower():
        return "div"
    if "لواء" in name_ar or "brigade" in name_ar.lower():
        return "bde"
    if "كتيبة" in name_ar or "battalion" in name_ar.lower():
        return "bn"
    if "سرية" in name_ar or "company" in name_ar.lower():
        return "coy"
    if "السرب" in name_ar or "سرب" in name_ar or "squadron" in name_ar.lower():
        return "sqn"
    if "رف " in name_ar or "platform" in name_ar.lower():
        return "flot"
    return "unit"


def _extract_counts(text: str) -> dict[str, int]:
    """Pull numeric counts from a paragraph (e.g. '12 طائرة' → {aircraft: 12})."""
    counts: dict[str, int] = {}
    # Find all "(N)" or "N type" patterns
    for m in NUMERIC_TRAIL.finditer(text):
        num = int(m.group(1))
        # The next word AFTER the number tells us what it counts
        # Skip — we just record total count
        counts["count"] = max(counts.get("count", 0), num)
    # Specific equipment phrases
    if "قاذف" in text or "قاذفاً" in text:
        m = re.search(r"\((\d+)\)\s*(?:قاذفاً|قاذف)", text) or re.search(r"(\d+)\s*قاذف", text)
        if m: counts["launchers"] = int(m.group(1))
    if "طائرة" in text or "طائرات" in text:
        m = re.search(r"\((\d+)\)\s*طائر", text) or re.search(r"(\d+)\s*طائر", text)
        if m: counts["aircraft"] = int(m.group(1))
    if "سرايا" in text or "سرية" in text:
        m = re.search(r"(\d+)\s*سراي?ا", text) or re.search(r"\((\d+)\)\s*سراي?ا", text)
        if m: counts["companies"] = int(m.group(1))
    if "كتيبة" in text or "كتائب" in text:
        m = re.search(r"(\d+)\s*كتيبة", text) or re.search(r"(\d+)\s*كتائب", text)
        if m: counts["battalions"] = int(m.group(1))
    return counts


# ============================================================================
# Outline parser
# ============================================================================

def _detect_depth(line: str) -> tuple[int, str] | None:
    """Return (depth, rest_of_line) if this line has a recognizable bullet, else None.
    Returns the highest-depth match (most nested wins) since outer patterns
    can sometimes match inner ones.
    """
    line = line.strip()
    if not line:
        return None
    # Doubled letters (depth 3) — most specific
    m = RE_DEPTH_3_AR_VAR.match(line)
    if m and line.startswith("("):
        # confirm both letters are same
        inner = m.group(1)
        if inner and inner == m.group(1):
            return (3, m.group(2).strip())
    # Letter in parens (depth 2)
    m = RE_DEPTH_2_AR.match(line)
    if m and line.startswith("("):
        # Avoid matching depth-3 doubled
        rest = m.group(2)
        if not re.match(r"^[أبجدهوزحطيك]\s*\)", rest):
            return (2, rest.strip())
    # Number in parens (depth 1)
    m = RE_DEPTH_1_NUM.match(line)
    if m:
        return (1, m.group(2).strip())
    # Top-level letter
    m = RE_DEPTH_0_AR_LONG.match(line) or RE_DEPTH_0_AR.match(line)
    if m:
        return (0, m.group(2).strip())
    return None


def _generate_uid(side: str, name_ar: str, depth: int, idx: int) -> str:
    """Generate a stable UID for a unit."""
    prefix = "R" if side == "RED" else "B"
    # Try to pull a meaningful tag from the name
    m = re.search(r"(\d+)", name_ar)
    if m:
        tag = m.group(1)
    else:
        # First few non-space chars
        tag = re.sub(r"\s+", "", name_ar)[:6]
    return f"{prefix}-d{depth}-{tag}-{idx:03d}"


def parse_docx_oob(path: Path, side: str) -> ForceOOB:
    """Walk the .docx paragraph stream and build a ForceOOB."""
    doc = Document(str(path))
    units: list[ForceUnit] = []
    parent_stack: list[tuple[int, str]] = []  # [(depth, uid), ...]

    body = doc.element.body
    idx = 0
    for child in body.iterchildren():
        tag = child.tag.split("}")[-1]
        if tag != "p":
            continue
        text = "".join(t.text or "" for t in child.iter(qn("w:t"))).strip()
        if not text:
            continue
        det = _detect_depth(text)
        if det is None:
            # Could be the side header line ("RED TEAM", "قوة الواجب المشتركة (JTF1).")
            continue
        depth, name_ar = det
        # Strip trailing period
        name_ar = name_ar.rstrip(".").strip()

        # Pop stack to current depth
        while parent_stack and parent_stack[-1][0] >= depth:
            parent_stack.pop()
        parent_uid = parent_stack[-1][1] if parent_stack else None

        domain, type_ = _classify(name_ar)
        echelon = _echelon_from_text(name_ar)
        counts = _extract_counts(name_ar)
        uid = _generate_uid(side, name_ar, depth, idx)
        idx += 1

        units.append(ForceUnit(
            uid=uid, side=side,
            name_ar=name_ar,
            name_en="",
            echelon=echelon, domain=domain, type=type_,
            parent_uid=parent_uid, depth=depth,
            counts=counts,
            raw_line=text,
        ))

        parent_stack.append((depth, uid))

    return ForceOOB(side=side, source_file=str(path), units=units)


# ============================================================================
# Smoke test
# ============================================================================
if __name__ == "__main__":
    import sys
    from collections import Counter

    root = Path(__file__).resolve().parent.parent.parent
    paths = [
        (root / "inputs/forces/red_team.docx", "RED"),
        (root / "inputs/forces/blue_team.docx", "BLUE"),
    ]
    for path, side in paths:
        if not path.exists():
            print(f"SKIP — {path} not found")
            continue
        oob = parse_docx_oob(path, side)
        print(f"\n{'='*72}")
        print(f"  {side}  ({path.name}) — {len(oob.units)} units parsed")
        print(f"{'='*72}")
        print(f"  By echelon: {oob.count_by_echelon()}")
        print(f"  By domain : {oob.count_by_domain()}")
        # Show first 12 + last 4
        print(f"\n  First 12 units:")
        for u in oob.units[:12]:
            print(f"    d{u.depth}  {u.uid:28s} [{u.domain:9s}/{u.type:20s}/{u.echelon:4s}]  {u.name_ar[:55]}")
        print(f"\n  Last 4 units:")
        for u in oob.units[-4:]:
            print(f"    d{u.depth}  {u.uid:28s} [{u.domain:9s}/{u.type:20s}/{u.echelon:4s}]  {u.name_ar[:55]}")
