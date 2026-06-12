# CMO Functional Rules — EXHAUSTIVE set

This is the **complete** caption-grounded rule extraction: every fetchable in-domain CMO tutorial
transcript (255 videos across 9 buckets) was mined into implementable behavior rules, deduplicated,
and organized per bucket. **945 rules total.** This set **supersedes** the curated first-pass specs
(`../1`–`../4`), whose content was absorbed during synthesis.

Excluded by design (non-actionable): `Game UI & Meta`, `Scripting / Automation (Lua)`, and the 3
unfetchable videos. **Caveat:** transcripts are YouTube auto-generated — numbers are captured
verbatim but are usually per-DB-unit illustrations, not universal constants; each rule carries a
confidence tag.

## Specs (by bucket)

| Bucket | File(s) | Rules | Absorbed first-pass |
| --- | --- | ---: | --- |
| **Sensors / EW / IADS** | `sensors-ew-part1.md`, `-part2.md`, `-part3.md` | 197 | `1-movement-detection.md` |
| **Strike & Weapons** | `strike-weapons-part1.md`, `-part2.md`, `-part3.md` | 211 | `3-damage-attrition.md` |
| **Naval & Subsurface** | `naval-subsurface.md` | 112 | `3-damage-attrition.md` |
| **Ground & Movement** | `ground-movement.md` | 97 | `1-movement-detection.md` |
| **Logistics & Basing** | `logistics-basing.md` | 74 | — (new) |
| **Scenario Authoring** | `scenario-authoring-part1.md`, `-part2.md` | 137 | `4-scenario-authoring.md` |
| **Doctrine & Adjudication** | `doctrine-adjudication.md` | 58 | `2-doctrine-wra-engagement.md` |
| **General Tactics & Employment** | `general-tactics.md` | 37 | — (new) |
| **Terrain & Environment** | `terrain-environment.md` | 22 | `1-movement-detection.md` |

The three largest buckets are split into `-partN.md` files (each part covers a disjoint slice of
that bucket's rules; titled "… — Part n/N"). Read all parts of a bucket together.

## How these were produced

`Workflow: cmo-exhaustive-rules` — Map (inventory → bucket→videoId) → Extract (56 batches of 5
transcripts → 1,266 structured rules) → Synthesize (per-bucket dedup + organize, absorbing the
first-pass specs). Re-runnable via the script under the session's `workflows/scripts/`.

## Relationship to the rest of `docs/cmo-functional-rules/`

- `../README.md` — overview of the whole CMO knowledge set.
- The **first-pass** curated specs (`../1`–`../4-*.md`, ~75 videos) are **kept as referenced
  companions** — 7 specs here cite them for overlapping detail, and a few authorities (radar-horizon
  calculator, the general damage/Pk model) live **only** there. They can't be deleted until those
  references are inlined here.
- `../5-build-playbook.md` + `../sample-sahil-corridor.json` — the worked "build a scenario the CMO
  way" example (validates `ok: true`). These rules are its behavior contract.
