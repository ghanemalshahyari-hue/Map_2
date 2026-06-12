"""graph/generation/schema — Phase 3 Pydantic v2 schemas.

Four document schemas (OPORD, Staff Estimates, Time Analysis,
Initial Planning Guidance) plus the `Phase3Inputs` model that
defines the shape of `inputs.json`.

Per scoping doc §18 C13: the authoritative schema shapes are
expressed here as clean Pydantic v2 BaseModel classes with
**types only** — no `Field("default")`, no `description=`, no
`examples=`. Those live in the YAML templates per-field (§2 of
referencedocs/20_phase3_templates_and_kinds.md).

Field names are character-identical to `NewClasses.md` so the
rename-only port to the user's separate health codebase stays
mechanical. `NewClasses.md` itself is a REFERENCE, not an
implementation source (§18 C13 of the scoping doc).
"""
