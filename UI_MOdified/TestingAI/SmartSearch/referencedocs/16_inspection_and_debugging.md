# 16 — Inspection and Debugging

> How to *see* what the pipeline does at every stage. Critical for this project —
> you explicitly asked to verify the stored vectors yourself.

---

## The four inspection surfaces

### 1. `output/parsed/<source_folder>/<doc>.json`

After the `parse` node runs, each parsed doc is serialised to JSON. Open it in any editor.

**What you see**:
- Top-level `text` field (flat fallback text)
- `texts` — ordered list of all text items with section references
- `tables` — each with rows/cells, caption, page number
- `pictures` — image regions with captions
- `pages` — per-page metadata
- `groups` — section-hierarchy groupings

**How to read**:
```bash
# Pretty-print a specific doc
jq . output/parsed/folder_2a_both_relevant/project_requirements.json | less
```

**Use to verify**: parser picked up sections correctly; tables survived; no classification noise.

### 2. `output/chunks/<slug>/all_chunks.jsonl` and `enriched_chunks.jsonl`

After the `chunk_document` node runs, HybridChunker's output is streamed line-by-line to `all_chunks.jsonl`. After `enrich_chunks`, post-processed output is in `enriched_chunks.jsonl` (same folder).

**Structure**:
```json
[
  {
    "text": "3-12. Plan is the first step ...",
    "meta": {
      "headings": ["Chapter 3 — The Operations Process", "3-2 Plan"],
      "page_numbers": [41, 42],
      "origin": {...}
    },
    "contextualized_text": "Chapter 3 — The Operations Process / 3-2 Plan\n\n3-12. Plan is the first step ...",
    "chunk_type": "body",
    "chunk_index": 42
  },
  ...
]
```

**How to read**:
```bash
# See chunk boundaries (one JSON object per line in the JSONL)
cat output/chunks/folder_2a_both_relevant/all_chunks.jsonl \
  | jq -c '{idx: .chunk_index, heading: .meta.headings, preview: .text[0:80]}'
```

**Use to verify**: chunks respect section boundaries; table chunks stay whole; no undersized orphans; `contextualized_text` is what you actually embed.

### 3. Qdrant dashboard

`http://localhost:6333/dashboard`

**What you can do**:
- Click **Collections** in left nav.
- Select a collection (e.g. `folder_2a_both_relevant`).
- Click **Points** tab → see every stored point.
- Click any point → right panel shows:
  - ID
  - Vectors expandable: `dense` (3072 floats), `sparse` (index/value pairs)
  - Full payload (text + metadata)
- Filter by payload: e.g. `chunk_type = "table"`, or `page_numbers[?] = 42`.
- Search: try the Query API interactively.

**Use to verify**: vectors got stored; payloads are rich; counts match expected chunk count per doc; filter queries narrow correctly.

### 4. CLI peek script (to build later)

`scripts/peek_qdrant.py` — planned, not yet written.

**Intended behaviour**:
```bash
python scripts/peek_qdrant.py --collection folder_2a_both_relevant --n 3
```
Prints:
- 3 random points with text preview
- Sparse vector top-5 weighted indices
- Dense vector norm (should be ~1.0)
- Full payload

For terminal-only inspection. Quick health check.

---

## Logs and error artefacts

### Graph-level errors (state field)

After an ingestion run, `state["all_errors"]` is the consolidated list. Each entry:
```python
{
    "file": "ATP-3-21-8.pdf",
    "stage": "parse" | "chunk" | "embed" | "upsert",
    "error_type": "DoclingTableError",
    "message": "...",
    "traceback": "<full stack>",
    "timestamp": "2026-04-17T10:45:12Z",
}
```
`main.py` pretty-prints these at the end of each run. Q5 locked this behaviour.

### Docker / Qdrant server logs
```bash
docker logs qdrant              # last 100 lines
docker logs -f qdrant           # follow in real time
docker logs qdrant --since 10m  # last 10 minutes
```

### Python library debug logging
```python
import logging
logging.basicConfig(level=logging.INFO)
logging.getLogger("docling").setLevel(logging.DEBUG)
logging.getLogger("qdrant_client").setLevel(logging.DEBUG)
```
Flood of information — reach for only when chasing a specific bug.

---

## Common debugging scenarios

### "My chunks look weird"
- Open `output/chunks/<slug>/all_chunks.jsonl` and scroll. Check `meta.headings` — are they right? `text` — does it start/end at section boundaries?
- If chunks span sections: HybridChunker config issue, check `max_tokens` and `merge_peers`.
- If tables got split: bug, file against Docling.
- If chunks are tiny: `merge_peers=True` should fix; re-run.

### "Retrieval quality is bad"
Before blaming hybrid tuning:
- **Eyeball the top-k results** for a test query. Is the right chunk even in the top-50? If not, it's a recall problem — look at encoders.
- **Run dense-only and sparse-only** queries separately. Which fails?
  - Dense fails → chunk might be too short, heading context missing, or domain-shifted vocabulary.
  - Sparse fails → query phrasing doesn't share tokens with the chunk; consider acronym expansion.
- **Check payload filter** — are you accidentally filtering out the right chunk?

### "Something crashed at embed / upsert"
- Read `state["embed_errors"]` or `state["upsert_errors"]`.
- Common: empty chunk text (filter these out), oversized input (shouldn't happen with HybridChunker).
- For upsert: Qdrant reachable? `curl http://localhost:6333/` — if server is down, docker start it.

### "Dashboard shows zero points after I thought I upserted"
- Wrong collection name? Check exact spelling (case-sensitive).
- Upsert silent failure? Try `client.count(collection_name=...)` — more explicit than dashboard refresh.
- Deterministic IDs clashing across runs intentionally overwriting? Check if you re-ran the same doc — Q4 locked overwrite semantics.

---

## Sanity scripts to have around (to build later)

These aren't written yet — reminders for when we need them:

| Script | Purpose |
|---|---|
| `scripts/peek_qdrant.py` | Print N random points with text + vector previews |
| `scripts/dense_sanity.py` | Embed two paraphrased sentences, show cosine |
| `scripts/count_chunks.py` | Per-doc chunk count + payload histogram |
| `scripts/compare_encoders.py` | Dense vs sparse vs hybrid top-k for a query |

Directory: `scripts/` under the project root — does not exist yet.

---

## Verifying the pipeline end-to-end on a test folder

When we start running:

```bash
cd /Users/hextechkraken/Desktop/myfiles/DecisionMakingSteps
source venv/bin/activate
python main.py
```

Then after it completes, in three other terminal windows:

**Terminal 2 — disk artefacts**:
```bash
ls -la output/parsed/folder_2a_both_relevant/
ls -la output/chunks/folder_2a_both_relevant/
```

**Terminal 3 — Qdrant**:
```bash
curl -s http://localhost:6333/collections | jq .
curl -s http://localhost:6333/collections/folder_2a_both_relevant | jq .result.points_count
```

**Browser — Qdrant dashboard**:
`http://localhost:6333/dashboard` → click collection → inspect points.

All four of those should agree on chunk count and be mutually consistent. If they're not, the graph state errors tell you where the divergence started.
