# CMO Functional Rules — EXHAUSTIVE set

This is the **complete** caption-grounded rule extraction: every fetchable in-domain CMO tutorial
transcript (255 videos across 9 buckets) was mined into implementable behavior rules, deduplicated,
and organized per bucket. **945 rules total.** This set is **fully self-contained** — it replaces the
earlier curated first-pass specs, whose unique content has been inlined here (they were then removed).

Excluded by design (non-actionable): `Game UI & Meta`, `Scripting / Automation (Lua)`, and the 3
unfetchable videos. **Caveat:** transcripts are YouTube auto-generated — numbers are captured
verbatim but are usually per-DB-unit illustrations, not universal constants; each rule carries a
confidence tag.

## Specs (by bucket)

| Bucket | File(s) | Rules |
| --- | --- | ---: |
| **Sensors / EW / IADS** | `sensors-ew-part1.md`, `-part2.md`, `-part3.md` | 197 |
| **Strike & Weapons** | `strike-weapons-part1.md`, `-part2.md`, `-part3.md` | 211 |
| **Naval & Subsurface** | `naval-subsurface.md` | 112 |
| **Ground & Movement** | `ground-movement.md` | 97 |
| **Logistics & Basing** | `logistics-basing.md` | 74 |
| **Scenario Authoring** | `scenario-authoring-part1.md`, `-part2.md` | 137 |
| **Doctrine & Adjudication** | `doctrine-adjudication.md` | 58 |
| **General Tactics & Employment** | `general-tactics.md` | 37 |
| **Terrain & Environment** | `terrain-environment.md` | 22 |

The three largest buckets are split into `-partN.md` files (each part covers a disjoint slice of
that bucket's rules; titled "… — Part n/N"). Read all parts of a bucket together.

## How these were produced

`Workflow: cmo-exhaustive-rules` — Map (inventory → bucket→videoId) → Extract (56 batches of 5
transcripts → 1,266 structured rules) → Synthesize (per-bucket dedup + organize, absorbing the
first-pass specs). Re-runnable via the script under the session's `workflows/scripts/`.

## Relationship to the rest of `docs/cmo-functional-rules/`

- `../README.md` — overview of the whole CMO knowledge set.
- The earlier **first-pass** curated specs (the old `../1`–`../4-*.md`) have been **inlined into this
  set and deleted** — every authority that lived only there (radar-horizon calculator, best-LOS Lua,
  land-cover ranges, the general damage/Pk model, the "why won't it fire" checklist, …) is now here.
  Recoverable from git history if ever needed.
- `../5-build-playbook.md` + `../sample-sahil-corridor.json` — the worked "build a scenario the CMO
  way" example (validates `ok: true`). These rules are its behavior contract.
