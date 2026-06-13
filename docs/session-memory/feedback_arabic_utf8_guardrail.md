---
name: feedback_arabic_utf8_guardrail
description: Arabic/non-ASCII UI strings must be saved as UTF-8; mojibake double-encoding root cause (commit 13cceef) + the regression test that catches it
metadata: 
  node_type: memory
  type: feedback
  originSessionId: be6a96a9-1bf6-4297-8c95-f319974a17e7
---

**Guardrail (2026-06-13):** All Arabic (and any non-ASCII) UI strings in client/server source **must be saved as UTF-8**. Never let an editor or transform tool re-save a source file in Windows-1252/cp1252 — that double-encodes every Arabic glyph + em-dash.

**Why / root cause:** around commit **`13cceef`** ("h"), `UI_MOdified/client/shell/doc-understanding-review.js` (whole file) and `UI_MOdified/client/home.js` (2 lines) were re-saved as **UTF-8 bytes mis-decoded as cp1252, then re-encoded as UTF-8** — classic double-encoding (mojibake). Every Arabic literal + em-dash corrupted, e.g. `Ù‚ÙˆØ§Ø¹Ø¯ Ø§Ù„Ø¹Ø¯Ùˆ` instead of `قواعد العدو`, `â€"` instead of `—`. The runtime data path (`file.text()` → `JSON.parse` → clone → `fetch`) was always UTF-8-clean; only the **source literals** were corrupted.

**How to apply (the fix, commit `52dfc6e` on main):** reverse the double-encoding — map cp1252 special glyphs + latin1 high bytes back to their bytes and decode the byte-run as UTF-8, **run-based** (decode only contiguous corrupted runs; preserve ASCII, real Unicode, and any BOM). A whole-file pass is safe ONLY for a fully-corrupted file; for a partially-corrupted file (`home.js` had 10 genuine em-dashes a blind pass would destroy) apply it **line-scoped** to mojibake lines only.

**Test guardrail — run after any change touching Arabic UI strings:** `UI_MOdified/scripts/test-utf8-mojibake-arabic-a.js` (17/0). It asserts: no mojibake bigrams in the affected/likely client files, the known Arabic labels are correct (e.g. `فهم الذكاء الاصطناعي`, `قواعد العدو`, `توليد السيناريو`, home Blue/Red Force names), the import data path preserves Arabic, and `app.html` declares `<meta charset="UTF-8">`. A live byte→HTTP→browser render proof confirmed correct RTL Arabic.

Part of [[project_doc_review_persistence_demo_cleanup]] · [[project_doc_understanding_pipeline]] · reinforces [[feedback_shared_working_tree_concurrency]].
