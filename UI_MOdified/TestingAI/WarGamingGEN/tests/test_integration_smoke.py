"""
End-to-end integration smoke test.

Proves the foundation:
  1. Smart-search retrieves doctrine for a wargame-relevant query.
  2. Retrieved chunks are formatted into an LLM prompt.
  3. LLM (GPT-4o) reads the doctrine context + a scenario fragment, then
     produces a Pydantic-validated structured response.

If this passes, the architecture is sound. Building the full 3-agent
orchestrator on top is mechanical.

Run:
    cd WarGameGenerator/
    source ../SmartSearch/venv_mac/bin/activate
    python -m tests.test_integration_smoke
"""
from __future__ import annotations
import sys
from pathlib import Path

# Ensure src/ is importable when run as a module
_THIS = Path(__file__).resolve()
sys.path.insert(0, str(_THIS.parent.parent))

from pydantic import BaseModel, Field
from src.retrieval.smart_search_client import retrieve, format_for_prompt
from src.llm.client import LLMClient
from src.llm.schemas import ComponentAction


class MiniAdjudicatorTest(BaseModel):
    """Minimal structured output to validate the full pipeline."""
    chosen_doctrine: str = Field(..., description="The cited doctrine reference (e.g., 'FM 3-90')")
    force_ratio_call: str = Field(..., description="The advantage call: 'RED_ADV', 'CONTESTED', or 'BLUE_ADV'")
    reasoning: str = Field(..., description="2 sentences of doctrinal justification.")


def main() -> int:
    print("=" * 72)
    print("  WarGameGenerator integration smoke test")
    print("=" * 72)

    # ----------------------------------------------------------------------
    # STEP 1 — Retrieve doctrine for a realistic wargame query
    # ----------------------------------------------------------------------
    query = (
        "amphibious assault force ratio Red 4-MID landing prepared defense Blue "
        "minefield culmination point"
    )
    print(f"\n[1] Smart-search query:\n    {query!r}")
    chunks = retrieve(query, top_k=4, use_reranker=True)
    if not chunks:
        print("\n❌ FAIL: smart-search returned 0 chunks. Is Qdrant running?")
        return 1
    print(f"    → retrieved {len(chunks)} chunks:")
    for i, c in enumerate(chunks, 1):
        print(f"        [{i}] {c.source_doc:20s} score={c.score} → {c.short(100)}")

    # ----------------------------------------------------------------------
    # STEP 2 — Format chunks for the LLM prompt
    # ----------------------------------------------------------------------
    context = format_for_prompt(chunks, max_chars=3000)
    print(f"\n[2] Context formatted ({len(context)} chars). Sample:\n    {context[:200]!r}…")

    # ----------------------------------------------------------------------
    # STEP 3 — Call LLM with doctrine context, expect Pydantic-validated JSON
    # ----------------------------------------------------------------------
    system = """You are a doctrine-grounded wargame analyst. You ONLY cite the
doctrine excerpts provided to you. You output strict JSON matching the requested
schema. No prose outside JSON."""

    user = f"""SCENARIO FRAGMENT:
  Red has just landed 4-MID (Marine Infantry Division) on BLS-2 with the main
  amphibious wave at D+6h. Blue has 400 sea mines pre-laid (no clearance yet),
  one prepared mech brigade in defense, and an uncommitted reserve. Pre-engine
  force ratio at the beach = 1.4 : 1 in Red's favor (Blue's prepared-defense
  multiplier of 1.5 brings it BELOW the contested threshold).

DOCTRINE EXCERPTS (retrieved from the smart-search corpus):
{context}

TASK:
  Citing one of the doctrine excerpts above, decide the step advantage at this
  moment and justify it. Return strict JSON with:
    - chosen_doctrine: the specific doctrine citation you relied on
    - force_ratio_call: one of "RED_ADV", "CONTESTED", or "BLUE_ADV"
    - reasoning: 2 sentences mapping the doctrine to this scenario.
"""

    audit_dir = _THIS.parent / "smoke_audit"
    llm = LLMClient(audit_dir=audit_dir)
    print(f"\n[3] Calling LLM (model={llm.cfg.model})…")

    result = llm.call_with_schema(
        schema=MiniAdjudicatorTest,
        system=system, user=user,
        temperature=0.0, max_output_tokens=600,
        tag="integration_smoke",
    )

    # ----------------------------------------------------------------------
    # STEP 4 — Report
    # ----------------------------------------------------------------------
    print(f"\n[4] LLM result (Pydantic-validated):")
    print(f"    chosen_doctrine : {result.chosen_doctrine}")
    print(f"    force_ratio_call: {result.force_ratio_call}")
    print(f"    reasoning       : {result.reasoning}")

    # Acceptance checks
    print("\n" + "=" * 72)
    checks = [
        ("Retrieved ≥ 1 chunk", len(chunks) >= 1),
        ("LLM result is MiniAdjudicatorTest instance", isinstance(result, MiniAdjudicatorTest)),
        ("Doctrine citation non-empty", bool(result.chosen_doctrine)),
        ("Force-ratio call is valid", result.force_ratio_call in ("RED_ADV", "CONTESTED", "BLUE_ADV")),
        ("Reasoning ≥ 30 chars", len(result.reasoning) >= 30),
        ("Audit trail written", any(audit_dir.glob("*.json"))),
    ]
    all_pass = True
    for name, ok in checks:
        status = "✓ PASS" if ok else "✗ FAIL"
        if not ok:
            all_pass = False
        print(f"  {status:8s}  {name}")

    print("=" * 72)
    if all_pass:
        print("  ✅ INTEGRATION SMOKE PASSED — foundation is ready for the 3-agent orchestrator.")
        return 0
    print("  ❌ INTEGRATION SMOKE FAILED")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
