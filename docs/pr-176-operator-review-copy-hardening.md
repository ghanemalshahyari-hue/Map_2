# PR-176 — Operator Review Copy Hardening

**Status:** Design / documentation only. No code changes in this PR.  
**Depends on:** PR-175 (operator review boundary design).  
**Date:** 2026-05-26

---

## 1. Purpose

This document locks the wording rules for any future operator review UI. The risk being addressed is label drift: a future implementer writing a button called "Apply" or "Execute" when the action is only a dry-run approval — which would mislead operators into believing a live scenario change has occurred.

The rules here are binding constraints on all future review UI PRs (planned PR-179+, PR-185+). Any label, tooltip, confirmation message, status badge, or log entry that conflicts with these rules must be corrected before merge.

---

## 2. The Core Confusion to Prevent

The staging workflow has two distinct stages that must never be conflated:

| Stage | Gate | What it does | What it does NOT do |
|---|---|---|---|
| Operator review approval | Gate 2 | Allows a dry-run summary to be computed and shown | Does not mutate scenario, map, units, or lines |
| Live commit | Gate 4 | Applies changes to the live scenario | Only available in PR-185+ with full operator confirmation |

Gate 2 approval is permission to *preview*. Gate 4 commit is permission to *act*.  
These are different actions. They must use different words everywhere — in buttons, tooltips, logs, status badges, confirmation dialogs, and i18n strings.

If Gate 2 approval is ever labelled "Apply", the operator has been given false information about what they just authorized.

---

## 3. Approved Labels

These are the only permitted labels for Gate 2 and related review UI elements. Future PRs must choose from this list or propose an explicit amendment here first.

### Action labels (buttons and confirmations)

| Label | Use case |
|---|---|
| `Approve dry-run` | Primary Gate 2 approval action |
| `Reject proposal` | Gate 2 rejection action |
| `Hold for review` | Gate 2 pause action |
| `Confirm review` | Alternative for Approve dry-run where space is limited |
| `Proceed to preview` | Alternative for Approve dry-run in step-based flows |

### Status and badge labels

| Label | Use case |
|---|---|
| `Dry-run only` | Badge shown in proposal preview or review header |
| `No live changes` | Tooltip or sub-label below any approval button |
| `Committed: No` | Read-only status field inside review panel |
| `Live mutation: Disabled` | Read-only status field inside review panel |
| `Preview only` | Sub-label on any effects display |
| `Pending review` | Status when `operatorReview.decision === "pending"` |
| `Approved for dry-run` | Status when `operatorReview.decision === "approve_dry_run"` |
| `Rejected` | Status when `operatorReview.decision === "reject"` |
| `On hold` | Status when `operatorReview.decision === "hold"` |

### Confirmation dialog copy (Gate 2)

When a confirmation dialog is needed before setting `approve_dry_run`, the message must follow this pattern:

> "Approve this proposal for a dry-run preview only. No changes will be made to the live scenario, map, or units. The committed flag remains false."

The words "apply", "commit", "execute", "live change", "update scenario", and "push" must not appear in this message.

---

## 4. Forbidden Labels Before PR-185+

These labels are permanently forbidden for any Gate 2 or pre-Gate-4 UI element. They imply live action and must never be used before the controlled live apply path is implemented and accepted.

| Forbidden label | Why forbidden |
|---|---|
| `Apply` | Implies live scenario mutation — reserved for Gate 4 only |
| `Commit` | Implies `committed: true` — hard-locked false until Gate 4 |
| `Execute` | Implies a live operation has run |
| `Run live` | Directly implies live state change |
| `Update scenario` | Implies mutation of `window.RmoozScenario` |
| `Push to map` | Implies mutation of Leaflet map layers |
| `Auto-approve` | Implies approval without explicit operator action |
| `Accept and apply` | Conflates Gate 2 review with Gate 4 commit |
| `Stage` | Ambiguous at Gate 2; reserved for Gate 4 description only |
| `Submit` | Implies backend submission; no backend at Gate 2 |
| `Send` | Same as Submit |
| `Confirm and apply` | "Apply" is forbidden regardless of framing |
| `Save` | Implies persistence; staging proposals are not persisted at Gate 2 |
| `OK` | Too ambiguous; does not communicate the safety boundary |
| `Yes` | Same as OK |

---

## 5. Required Contextual Disclosures

Every future Gate 2 review panel must display at least one of the following disclosures near the approval action, before the operator acts. These may be rendered as a static note, a tooltip, or a sub-label.

**Required disclosure (primary):**
> "Approving allows a dry-run preview only. The live scenario is not changed."

**Acceptable alternatives:**
> "Dry-run approval — no live changes."  
> "This action does not modify the scenario, map, or units."  
> "Committed: No · Live mutation: Disabled"

The disclosure must be visible without the operator hovering or expanding anything. It may not be hidden inside a tooltip only.

---

## 6. AR (Arabic) Approved Equivalents

Future i18n implementation must use these Arabic translations for the approved labels. The same forbidden-label rules apply — the Arabic UI must not use words meaning "apply", "commit", or "execute" for Gate 2 actions.

| EN label | AR equivalent |
|---|---|
| `Approve dry-run` | `الموافقة على التشغيل التجريبي` |
| `Reject proposal` | `رفض الاقتراح` |
| `Hold for review` | `تعليق للمراجعة` |
| `Confirm review` | `تأكيد المراجعة` |
| `Proceed to preview` | `المتابعة إلى المعاينة` |
| `Dry-run only` | `تشغيل تجريبي فقط` |
| `No live changes` | `لا تغييرات حية` |
| `Committed: No` | `مُلتزم به: لا` |
| `Live mutation: Disabled` | `التعديل الحي: معطّل` |
| `Preview only` | `معاينة فقط` |
| `Pending review` | `في انتظار المراجعة` |
| `Approved for dry-run` | `موافق عليه للتشغيل التجريبي` |
| `Rejected` | `مرفوض` |
| `On hold` | `معلّق` |

**Arabic disclosure (required):**
> `الموافقة تتيح معاينة التشغيل التجريبي فقط. لا يتم تغيير السيناريو الحي.`

---

## 7. Future i18n Key Naming Convention

When future PRs add i18n keys for review UI, they must follow this naming pattern so keys are easy to audit:

```
sw-review-approve-dryrun          → "Approve dry-run"
sw-review-reject                  → "Reject proposal"
sw-review-hold                    → "Hold for review"
sw-review-confirm                 → "Confirm review"
sw-review-proceed                 → "Proceed to preview"
sw-review-badge-dryrun            → "Dry-run only"
sw-review-badge-no-live           → "No live changes"
sw-review-badge-committed         → "Committed: No"
sw-review-badge-live-mutation     → "Live mutation: Disabled"
sw-review-badge-preview           → "Preview only"
sw-review-status-pending          → "Pending review"
sw-review-status-approved         → "Approved for dry-run"
sw-review-status-rejected         → "Rejected"
sw-review-status-hold             → "On hold"
sw-review-disclosure              → "Approving allows a dry-run preview only. The live scenario is not changed."
```

Keys must not be named with words that appear in the forbidden-labels list (`apply`, `commit`, `execute`, etc.).

---

## 8. Enforcement Notes for Future PRs

### PR-177 (type guard)
`isValidReviewRecord()` does not validate UI copy — that is a human review concern, not a runtime check. However, the function must reject records where `decision` is any string outside the approved enum values, which closes the path for inventive callers using "apply" as a decision string.

### PR-178 (dry-run contract)
All copy in that document must conform to §3 and §4 above. Any reference to Gate 3 confirmation must describe the action as "confirm dry-run output" not "apply dry-run."

### PR-179+ (review panel implementation)
Before merge, a reviewer must verify that every visible string, button label, tooltip, and status badge in the new panel matches the approved labels in §3 and does not contain any string from the forbidden list in §4.

### PR-185+ (live apply)
Only at Gate 4 may the word "Apply" be used, and only inside the explicit two-click confirmation sequence. Even there, the label must clarify scope: "Apply to live scenario" — not a bare "Apply."

---

## 9. Safety Checklist

This PR:

- [x] Changes documentation only (`docs/pr-176-operator-review-copy-hardening.md`)
- [x] Adds no runtime behavior
- [x] Adds no UI
- [x] Adds no i18n keys (key naming conventions are future guidance only)
- [x] Adds no review controls
- [x] Adds no staging storage
- [x] Adds no approval/reject/hold buttons
- [x] Adds no apply path
- [x] Keeps imported package preview read-only
- [x] Does not modify `app.js` or `adjudicator-map.js`
- [x] Does not mutate `window.units`, `window.lines`, `window.RmoozScenario.stepIndex`, the map, or the real scenario
- [x] Makes no backend calls
- [x] Does not re-add external scenario catalog UI
- [x] Does not link `scen-catalog-contract.js`
- [x] Import Diagnostics remains collapsed by default (no change to that behavior)
- [x] `_swStagingProposal` does not exist and is not created

---

## 10. Files Changed in This PR

**One file only:**

- `docs/pr-176-operator-review-copy-hardening.md` — this file (new)

All runtime files are unchanged.
