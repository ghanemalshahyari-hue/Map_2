---
name: feedback-event-log-not-chat
description: The Event Log panel (PR-4 and onward) must visually read as a military message/event log — not a chat surface.
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 0e593b81-b416-48af-99fb-e69093db82a8
---

The Event Log (bottom docked panel in [client/app.html](UI_MOdified/client/app.html) — `#event-log`, styled in [client/style.css](UI_MOdified/client/style.css) under the "PR-4 — Event Log placeholder" block, controlled by [client/shell/event-log.js](UI_MOdified/client/shell/event-log.js)) must look like an operational message log with rows, DTG timestamps, categories, and severity — not a chat UI.

**Why:** the user reinforced this rule the first time the placeholder shipped. The brief already said "feel like a military message log, not a chat window," and they want it preserved as future PRs (journal feed, AI proposals, AAR replay) start populating rows with real data.

**How to apply:**
- Render as a tabular layout: Time / Severity / Category / Source / Message columns. No avatars, no speech bubbles, no left/right alignment by speaker, no rounded corners on row bodies, no emojis.
- DTG cell should be monospace and high-contrast (it's an operational timestamp).
- Severity is a small inline chip with sharp 2px corners — not a colored background bubble around the row.
- Use zebra striping + a left-edge severity stripe to reinforce ledger feel. Avoid hover-highlight on rows (a hover affordance implies clickable conversation entries).
- Source IDs render in uppercase monospace, like callsigns or system tags.
- When the journal is connected (later PRs), append rows top-down or bottom-up like a teletype — never as conversation turns.

If a future change starts adding chat-like affordances (avatars, bubbles, "you/them" lanes, rounded message blobs, reactions), pause and flag it: that direction has been explicitly rejected.
