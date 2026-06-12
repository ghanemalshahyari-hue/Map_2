# Follow-up: Gemma drafter Pydantic schema-compliance failures

**Status:** open. Discovered 2026-04-27 during tiered-retrieval Phase 0
end-to-end smoke (§C28). NOT a Phase 0 regression — reproduces independent
of the rename.

**Decision needed before:** any Phase 3 work that depends on
`staff_brief.conclusions` rendering, OR any user-facing claim that
all four v1 docs are clean against LM Studio Gemma. Phase 1+ of
tiered retrieval is independent and can land first.

---

## Symptom

`scripts/generate_documents.py` aborts at the drafter step for one
or two retrieved-field groups:

| group (Pydantic class) | template | fails under `=1` (Responses) | fails under `=0` (chat) |
|---|---|---|---|
| `Draft_planning_directives` | `initial_planning_guidance` | YES | no (works) |
| `Draft_conclusions` | `staff_brief` | YES | YES |

`with_structured_output` returns a shape Gemma chose: most of the
prompt-context fields appear at top level (`operation_name`,
`operation_echelon`, `mission_intent_free_text`, …) and the actual
schema fields are buried under a wrapper key (`planning_guidebook`).
Pydantic v2 with `extra="forbid"` rejects:

```
N validation errors for Draft_planning_directives
report_production
  Field required [type=missing, ...]
coordination_duties
  Field required [type=missing, ...]
operation_name
  Extra inputs are not permitted [type=extra_forbidden, ...]
planning_guidebook
  Extra inputs are not permitted [type=extra_forbidden, ...]
```

Repair pass in `graph/shared/responses_client.py` retries with the
schema + previous failure as context; for Gemma+`Draft_conclusions`
the repair attempt also fails. Process exits 1 / 0 depending on
which doc was first to fail.

## What works

- Time-analysis (no drafter, all `computed`/`source_file_extracted`).
- Warning Order (no drafter, all `source_file_extracted`).
- Initial Planning Guidance under `LLM_USE_RESPONSES_API=0`.
- Retrieval against `ingest__operationalfiles__bgem3` is fine — the
  drafter receives correct chunks before validation dies.
- Cache invalidation is fine — the rename flips
  `operationalfiles_collections_tag` and the cached failure does not
  poison subsequent runs.

## Mitigation options (pick one before next drafter run)

1. **Loosen `extra="forbid"`** on the drafter draft classes in
   `graph/generation/section_drafter.py` (`Draft_<group_name>`
   dynamic classes) to `"allow"` or `"ignore"`. Add a post-filter
   that drops unknown keys before the renderer consumes them. Cheap;
   doesn't help when REQUIRED fields are missing — but pairs well
   with option 2.

2. **Two-pass repair with schema-as-text.** Today's repair prompt
   in `responses_client.py` retries with the *failed output* and the
   *error message*. Add the **JSON schema** of the target Pydantic
   class to the repair message. Gemma can usually fix shape errors
   when shown the explicit shape it must produce.

3. **Per-role drafter override.** Set `PHASE3_DRAFT_MODEL` to a more
   compliant model (the env wiring already exists in
   `graph/shared/llm_factory.py`). Keeps Gemma for extractor/critique;
   uses something else for drafter only. Lowest-effort, costs an
   extra model in LM Studio (or a second base URL).

4. **Drafter-only OpenAI fallback.** Route the drafter call via the
   real OpenAI endpoint (set `PHASE3_DRAFT_MODEL=gpt-4o-mini`,
   `LLM_BASE_URL` stays LM Studio for everyone else — but be careful,
   the factory uses a single `LLM_BASE_URL`; need a second base-URL
   knob OR switch the drafter through a different `ChatOpenAI` build).
   More plumbing than option 3.

5. **Different LM Studio model.** Try `qwen2.5-7b-instruct`, `llama-3.2-3b-instruct`,
   or a Gemma variant with better tool-use compliance. Same env
   surface; just pull and swap `LLM_MODEL` or `PHASE3_DRAFT_MODEL`.

## Where to find more detail

- Full forensic + reproduction commands: [`CLAUDE.md`](../CLAUDE.md)
  §C28 changelog, "Out-of-scope follow-up flagged in this session".
- Session context + project status: [`docs/memory.md`](memory.md)
  Session Handoff 2026-04-27 + the same "Out-of-scope follow-up"
  block.
- Log files captured this session: `/tmp/phase0_gen.log`
  (Responses=1 run), `/tmp/phase0_gen2.log` (Responses=0 run),
  `/tmp/phase0_warno.log` (warning_order isolation run that worked).

## Where this is NOT a problem

- The tiered-retrieval Phase 0 rename is plumbing-verified; this
  drafter compliance issue is orthogonal.
- Phases 1, 2, 5, 6, 7 of tiered retrieval don't touch
  `with_structured_output`. Phases 3+4 do (drafter sees
  `EvidenceBundle`; critique sees same), but they update *prompts*,
  not the structured-output mechanism — same Gemma compliance risk
  surface as today.

## Suggested order when picking this back up

1. Try option 3 (`PHASE3_DRAFT_MODEL=<more-compliant>`) first — five
   minutes of work, no code changes.
2. If no better LM Studio model is available locally, do option 2
   (schema-as-text repair). One file edit, deterministic.
3. If both fail, do option 1 (loosen `extra="forbid"`) AND option 2
   together. That's the belt-and-suspenders fix.

## What to update when this is fixed

- Drop the "3/4 .docx clean end-to-end" qualifier in `CLAUDE.md`
  project status line and the `§C28` changelog.
- Same for `docs/memory.md` Session Handoff + Open items.
- Delete this file.
