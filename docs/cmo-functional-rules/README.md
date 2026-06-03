# CMO Functional Rules — caption-grounded behavior specs

**Why this exists.** When asked to build a CMO-style function, an implementer (human or AI)
tends to invent plausible-but-wrong mechanics instead of matching how *Command: Modern Operations*
actually behaves. These specs fix that: each rule is extracted **from the tutorial caption
transcripts** (`../cmo-captions/<videoId>.txt`) and written as an **implementable behavior rule**
— inputs/parameters, step-by-step logic, thresholds/formulas (verbatim where stated), outputs,
and edge-case quirks — with the **source video** and a **confidence** tag on every rule.

> Treat these as the **behavior contract** for any RMOOZ feature that mimics a CMO function.
> If an implementation diverges from a rule here, the implementation is wrong (or the rule needs a
> sourced correction).

**Caveat:** transcripts are YouTube auto-generated, so wording can be imperfect. Stated numbers are
captured verbatim but are usually *per-database-unit illustrations*, not universal constants. Rules
marked Low/Med confidence are inferred or from secondary mentions.

## ⭐ The rules — [`exhaustive/`](exhaustive/README.md)

The single source of truth is the **exhaustive set**: **all 255 in-domain CMO tutorial videos mined
into 945 deduplicated behavior rules** across 9 per-bucket specs. Build against these.

| Bucket | File(s) |
| --- | --- |
| Sensors / EW / IADS (197) | `exhaustive/sensors-ew-part{1,2,3}.md` |
| Strike & Weapons (211) | `exhaustive/strike-weapons-part{1,2,3}.md` |
| Scenario Authoring & Event Editor (137) | `exhaustive/scenario-authoring-part{1,2}.md` |
| Naval & Subsurface (112) | `exhaustive/naval-subsurface.md` |
| Ground & Movement (97) | `exhaustive/ground-movement.md` |
| Logistics & Basing (74) | `exhaustive/logistics-basing.md` |
| Doctrine & Adjudication (58) — *drives the AI adjudicator* | `exhaustive/doctrine-adjudication.md` |
| General Tactics & Employment (37) | `exhaustive/general-tactics.md` |
| Terrain & Environment (22) | `exhaustive/terrain-environment.md` |

> Treat these as the **behavior contract**: if an implementation diverges from a rule, the
> implementation is wrong (or the rule needs a sourced correction). The earlier curated first-pass
> specs (`1-movement-detection.md` … `4-scenario-authoring.md`) are **kept as referenced companions**
> — several exhaustive rules cite them for overlapping detail, and a few authorities (e.g. the
> radar-horizon calculator, the general damage/Pk model) currently live **only** there. Don't delete
> them until those references are inlined.

## Worked build (apply the rules to a full scenario)

[`5-build-playbook.md`](5-build-playbook.md) walks **CMO's actual build-order step-by-step**, citing
the governing video/rule at each step and flagging every CMO mechanic RMOOZ can't represent yet. It
produces **[`sample-sahil-corridor.json`](sample-sahil-corridor.json)** — a complete ground/amphibious
scenario that **passes the real RMOOZ validator** (`ok: true`, 0 errors). Use it as the template to
"follow CMO exactly and build."

## How this maps to RMOOZ "not done yet"

These rules are the behavior reference for the CMO functions RMOOZ has **not** built (see the gap
analysis): the World State engine + continuous movement (`ground-movement` + `sensors-ew`), the AI
adjudicator's fire-decision logic (`doctrine-adjudication` — the highest-value match), realistic
adjudication outcomes (`strike-weapons` + `naval-subsurface`), and the unbuilt Scenario Authoring
Mode P1–P4 + Event Editor (`scenario-authoring`). Build against the rule, cite the rule.

## Provenance

Extracted from 284 caption transcripts in `../cmo-captions/` via the `cmo-exhaustive-rules` workflow
(map → extract in batches → per-bucket synthesis). 39 high-value transcripts (Doctrine Settings, WRA,
Radar, Point Defense, Bombing, Scenario Editor, Event Editor, …) were recovered before synthesis, so
the rules reflect the primary sources (e.g. the proficiency scale and WRA-Hold semantics).
