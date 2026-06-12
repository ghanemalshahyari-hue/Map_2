"""
Corpus coverage check — does smart-search return what we used in Claude3?

For each major doctrinal anchor / historical coefficient we cited in the
WarGamingClaude3 simulation, query the corpus and verify the top chunks
contain the expected keywords. Fast, deterministic. Output is a PASS/FAIL
matrix the user can eyeball.
"""
from __future__ import annotations
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.retrieval.smart_search_client import retrieve

# (query, expected_keywords_any_in_top_3, claude3_use_case)
CHECKS = [
    # ─── Doctrinal anchors used in the force-ratio model ──────────────
    ("FM 3-90 attacker 3:1 force ratio prepared defense",
     ["3:1", "FM 3-90", "prepared"],
     "Claude3 used FM 3-90 §5-23 threshold for the decisive-attack 3:1 rule"),

    ("ADP 3-0 culmination point operations",
     ["culmination", "ADP 3-0", "sustain"],
     "Claude3 culminated Red at FR<1.5:1 citing ADP 3-0"),

    ("AJP-3.1 sea control sea denial maritime operations",
     ["AJP-3.1", "sea control", "maritime"],
     "Claude3 framed naval phase as Red power-projection vs Blue sea-denial"),

    ("JP 3-02 amphibious operations five phases planning embarkation",
     ["JP 3-02", "amphibious", "phase"],
     "Claude3 used JP 3-02 phase 1/2/3 framework"),

    ("ATP 3-01.4 SEAD suppression enemy air defense",
     ["SEAD", "ATP 3-01.4", "air defense"],
     "Claude3 ran SEAD campaign at D-3 (step 2) using ATP 3-01.4 25-30% sortie share"),

    ("ATP 3-37.5 countermobility obstacle mine integration",
     ["countermobility", "ATP 3-37.5", "obstacle"],
     "Claude3 cited ATP 3-37.5 for Blue's 400 sea-mine defensive plan"),

    # ─── Historical analog coefficients ───────────────────────────────
    ("Iwo Jima naval gunfire pre-landing bombardment effectiveness defender",
     ["Iwo Jima", "bombardment", "0.10"],
     "Claude3 used Iwo Jima 0.10 attrition coefficient for pre-landing fires"),

    ("Wonsan 1950 minesweeper attrition mine clearance days delay",
     ["Wonsan", "minesweeper", "3,000"],
     "Claude3 used Wonsan 1950 to calibrate Blue's MCM-vs-mine attrition (all 4 Red MCMs killed Day 1)"),

    ("Ukrainian USV survival rate Magura Black Sea 2024",
     ["Magura", "USV", "Black Sea"],
     "Claude3 used 25-30% USV survival from Black Sea 2024 → 7 of 24 USVs reach"),

    ("Houthi Red Sea saturation multi-vector drone missile coordinated",
     ["Houthi", "saturation", "drone"],
     "Claude3 used Houthi 2024 saturation model: defender intercept × 0.6 at >4 threats/30s"),

    ("Falklands 1982 Exocet anti-ship missile Sheffield ship loss",
     ["Falklands", "Exocet", "Sheffield"],
     "Claude3 used Falklands ASCM model: P(hit)=0.5, P(kill|hit)=0.4"),

    ("NATO Libya 2011 Tomahawk Gulf of Sidra opening strike",
     ["Libya", "Tomahawk", "9,700"],
     "Claude3 cited Libya 2011 110-Tomahawk opening + 9,700-sortie campaign — same AOI"),

    ("Moskva Neptune anti-ship missile Ukraine 2022",
     ["Moskva", "Neptune", "2022"],
     "Claude3 used Moskva-Neptune precedent for Blue SSM repurposed as ASCM"),

    ("Cyprus 1974 amphibious airborne paratroop landing losses",
     ["Cyprus", "airborne", "1974"],
     "Claude3 used Cyprus 1974 5-8% drop-loss coefficient for Red 21st SOF"),

    ("SEAD Wild Weasel attrition aircraft loss SA-2 Vietnam",
     ["Wild Weasel", "SA-2", "Vietnam"],
     "Claude3 used Wild Weasel calibration: 25-30% sorties, 5% loss/sortie"),
]


def run_checks() -> int:
    results: list[tuple[str, bool, str, str]] = []
    print(f"Running {len(CHECKS)} corpus-coverage checks...\n")

    for query, expected, use_case in CHECKS:
        chunks = retrieve(query, top_k=3, use_reranker=False, use_glossary=False)
        if not chunks:
            results.append((use_case, False, "no chunks returned", query))
            continue
        all_text = " ".join(c.text for c in chunks).lower()
        missing = [kw for kw in expected if kw.lower() not in all_text]
        ok = len(missing) == 0
        top_src = chunks[0].source_doc
        if ok:
            results.append((use_case, True, f"all keywords found in top-3 from {top_src}", query))
        else:
            results.append((use_case, False, f"missing: {missing} (top src: {top_src})", query))

    # Print matrix
    width_uc = max(len(r[0]) for r in results)
    print("=" * (width_uc + 60))
    print(f"  {'PASS':<6} {'USE CASE':<{width_uc}}    DETAIL")
    print("-" * (width_uc + 60))
    passed = 0
    for use_case, ok, detail, _ in results:
        status = "✓" if ok else "✗"
        if ok: passed += 1
        print(f"  [{status}]   {use_case:<{width_uc}}    {detail}")
    print("=" * (width_uc + 60))
    print(f"  RESULT: {passed}/{len(results)} use cases covered by smart-search corpus")
    print("=" * (width_uc + 60))

    # Detail any failures
    failures = [(uc, q, d) for uc, ok, d, q in results if not ok]
    if failures:
        print("\nFailures (with full query):")
        for uc, q, d in failures:
            print(f"  • {uc}")
            print(f"    query: {q!r}")
            print(f"    detail: {d}")
            print()

    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    raise SystemExit(run_checks())
