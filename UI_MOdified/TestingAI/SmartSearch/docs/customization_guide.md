# Customization Guide

**Audience:** Anyone (human or AI) receiving this project who wants to add new
input files, change the topic, or change which documents get generated.

**You do NOT need to read the rest of the project to use this guide.** Each
section below is self-contained: pick the use case that matches what you
want to do, follow the steps, and verify.

---

## What this project does (1 minute)

This system reads PDFs/DOCX/TXT files (military doctrine, manuals,
references), stores them in a searchable database (Qdrant), and then writes
finished Arabic `.docx` documents that follow military planning templates
(MDMP — Military Decision-Making Process).

There are **two corpora** of input files:

1. **`inputs/operationalfiles/`** — primary planning manuals (FM-5-0, FM-6-0, etc.)
2. **`inputs/doctrine/`** — broader reference library (FM-3-0, ADP-3-0, etc.)

There are **four generated documents** today:

1. `time_analysis` — تحليل الوقت
2. `initial_planning_guidance` — دليل التخطيط الأولي
3. `staff_brief` — إيجاز هيئة الركن
4. `warning_order` — الأمر الإنذاري

When you run the pipeline, the system reads from the corpora plus two
user-uploaded files (a Warning Order draft and an Intel Report) and produces
the four `.docx` outputs.

---

## Edit-type legend

Throughout this guide, every step is tagged so you know what kind of change
it is:

| Tag | Meaning |
|---|---|
| **FILE-DROP** | Just copy/move/delete a file. No text editing. |
| **ENV** | Edit `.env` (one or two lines). |
| **YAML** | Edit a `.yaml` template file (no Python knowledge needed). |
| **PROMPT** | Edit text inside a Python prompt constant (no logic, just words). |
| **CODE** | Edit Python source — adding a registration entry to a list/dict. |
| **NEW-FILE** | Create a new file from scratch. |

The hardest tag is **CODE**. Even those are usually one-line additions to
a list — not real programming.

---

## Use-case index

Find your situation, then jump to the matching section.

| I want to... | Section | Difficulty |
|---|---|---|
| Add more files about the same topic that's already in the corpus | [§1](#1-add-more-files-same-topic) | Easy |
| Add a new corpus folder with files about a related topic (still military planning) | [§2](#2-add-a-new-related-topic-corpus) | Easy |
| Add a corpus about a completely different topic (e.g. medical, civilian) | [§3](#3-add-a-completely-different-topic) | Medium |
| Add a few files in a non-English language (e.g. Arabic) alongside English files | [§4](#4-add-non-english-files) | Easy |
| Switch the entire corpus to a different language (e.g. Arabic-only operationalfiles + Arabic-only doctrine) | [§5](#5-switch-the-corpus-to-a-different-language) | Medium |
| Replace or update an existing file | [§6](#6-replace-or-update-a-file) | Easy |
| Delete a file cleanly from the database | [§7](#7-delete-a-file) | Easy |
| Generate fewer documents in a single run (one-time choice) | [§8](#8-generate-fewer-docs-one-time) | Trivial |
| Permanently remove a document from the system | [§9](#9-permanently-remove-a-document) | Medium |
| Add a brand-new document type to the system | [§10](#10-add-a-new-document-type) | Hard |
| Change which collections a document reads from | [§11](#11-change-collection-wiring) | Medium |
| Tune retrieval thresholds or turn doctrine fallback on/off | [§12](#12-tune-retrieval-behavior) | Easy |

---

## Pre-flight checklist (do this once)

Before any of the steps below:

```bash
# 1. Make sure Qdrant (the database) is running
docker start qdrant
curl -s http://localhost:6333/readyz   # should say "all shards are ready"

# 2. Activate the Python virtual environment
cd /path/to/DecisionMakingSteps
source venv/bin/activate

# 3. Make sure your .env file has an LLM endpoint configured
# (Open .env and confirm LLM_BASE_URL, LLM_API_KEY, LLM_MODEL exist)
```

---

## 1. Add more files (same topic)

**Example:** You have FM-5-0 in `inputs/operationalfiles/` and you just got a
new manual about the same kind of staff planning. You want to drop it in.

### Steps

1. **FILE-DROP** — Copy the new file into the existing folder:
   ```bash
   cp ~/Downloads/new_manual.pdf inputs/operationalfiles/
   ```
2. Run the ingestion pipeline:
   ```bash
   python main.py
   ```

### What happens automatically

- Files already ingested are skipped (the system keeps a SHA-256 cache).
- Only the new file goes through the full pipeline.
- The Qdrant collection grows by however many chunks the new file produced.
- The next time you generate documents, any cached drafts that depended on
  this collection are automatically invalidated.

### Verify

```bash
# Should show one more file's worth of chunks than before
python scripts/peek_qdrant.py
```

### Edits required

**Zero.** Just file drop + run.

---

## 2. Add a new related-topic corpus

**Example:** You have operationalfiles + doctrine. Now you want to add a
third folder with Joint Publications (JP-3-0, JP-5-0, etc.) — different from
the existing two but still military planning.

### Steps

1. **FILE-DROP** — Create the folder and add files. Use lowercase letters,
   numbers, underscores, or hyphens only:
   ```bash
   mkdir inputs/joint_doctrine
   cp ~/Downloads/JP-*.pdf inputs/joint_doctrine/
   ```
2. Ingest:
   ```bash
   python main.py
   ```
3. **YAML** — Tell whichever document(s) should use this new corpus to read
   from it. Open the relevant template:
   - `prompts/initial_planning_guidance/template.yaml`
   - `prompts/staff_brief/template.yaml`
   - `templates/operation_order.yaml` (if you re-enable it)

   Find the field(s) you want to expand and add the new collection name:
   ```yaml
   field_name:
     kind: retrieved
     collections:
       - ingest__operationalfiles__bgem3
       - ingest__joint_doctrine__bgem3      # <-- add this line
   ```

   The collection name follows this rule: `ingest__<folder_name>__bgem3`
   where `<folder_name>` is your folder name lowercased with non-alphanumeric
   characters replaced by underscores.

### Verify

```bash
python -m graph.generation.template_loader   # should pass all templates OK
python scripts/generate_documents.py \
  --warning-order data/phase3_prompt_2.example.txt \
  --intel-report data/phase3_prompt_3.example.txt \
  --docs initial_planning_guidance \
  --out /tmp/test_new_corpus
```

### Edits required

- **FILE-DROP** (1)
- **YAML** (one or more `collections:` lists)

---

## 3. Add a completely different topic

**Example:** You want to add medical references, civilian regulations, or
any corpus that is NOT about military operations planning.

This is harder because the system has a **content gate** that rejects files
that aren't about military planning. You need to broaden the gate.

### Steps

1. **FILE-DROP** — Create the folder and drop your files:
   ```bash
   mkdir inputs/medical_refs
   cp ~/Downloads/*.pdf inputs/medical_refs/
   ```
2. **PROMPT** — Open `graph/prompts.py` and find the constant
   `SUFFICIENCY_CHECK_SYSTEM_PROMPT`. It contains a long prompt that tells
   the LLM what to ACCEPT and what to REJECT. Find the ACCEPT list and add
   your new topic. Example addition:
   ```
   - Medical and casualty management references for military operations
   ```
   Also add your topic to the §C18 history note inside the prompt so anyone
   reading it later understands the change.
3. Ingest:
   ```bash
   python main.py
   ```
4. **YAML** — Wire the new collection into whichever document(s) should
   consume it (same as §2 step 3).

### What happens if you skip step 2

The gate will reject every file in your new folder with a remark like
"irrelevant to MDMP — not military operations planning." The folder will
appear to ingest but produce zero chunks. Look at
`output/not_enough/<slug>/<stem>/check_decision.json` to see the rejection
remarks.

### Edits required

- **FILE-DROP** (1)
- **PROMPT** (1 — broaden the gate)
- **YAML** (one or more `collections:` lists)

---

## 4. Add non-English files

**Example:** You have Arabic doctrine PDFs.

### Steps

1. Install the language pack for Tesseract (the OCR engine):
   ```bash
   brew install tesseract-lang     # on macOS
   ```
2. **ENV** — Edit `.env`. Find the line `OCR_LANGS=eng` and change it:
   ```
   OCR_LANGS=eng+ara
   ```
   (Use `+` to combine languages. Use the ISO 639-2 code for your language.)
3. **FILE-DROP** — Drop your files into a folder under `inputs/` (or the
   existing folder).
4. Ingest:
   ```bash
   python main.py
   ```
5. **PROMPT** (only if needed) — If your files are in a non-English language
   AND the gate prompt's English keywords cause false rejections, broaden the
   gate prompt the same way as §3 step 2.

### Edits required

- **ENV** (1 line)
- Optionally **PROMPT** (1)

---

## 5. Switch the corpus to a different language

**Example:** You want to run the system with Arabic operationalfiles AND
Arabic doctrine instead of English. The topic is still MDMP. You still
want to generate the same 4 documents.

This is bigger than §4 ("add a few non-English files alongside English").
The existing YAML templates assume English filenames and use English
search terms. You need to update those too.

### Steps

1. Install the OCR language pack for your target language. For Arabic on
   macOS:
   ```bash
   brew install tesseract-lang
   ```

2. **ENV** — In `.env`, set the OCR languages:
   ```
   OCR_LANGS=eng+ara
   ```
   Keep `eng` even when the corpus is Arabic — many Arabic doctrine PDFs
   have English page numbers, headers, or scanned watermarks. Use `+` to
   combine languages. Use the ISO 639-2 code for any other language.

3. **FILE-DROP** — Decide whether to **replace** the English corpus or
   **add** the Arabic alongside it.

   **Replace** (clean cutover, recommended for a pure-Arabic deployment):
   ```bash
   rm inputs/operationalfiles/*.pdf
   rm inputs/doctrine/*.pdf
   cp ~/arabic_ofiles/*.pdf    inputs/operationalfiles/
   cp ~/arabic_doctrine/*.pdf  inputs/doctrine/
   ```

   **Augment** (keep both languages — the embedder bge-m3 is multilingual
   and retrieves cross-language fine):
   ```bash
   cp ~/arabic_ofiles/*.pdf    inputs/operationalfiles/
   cp ~/arabic_doctrine/*.pdf  inputs/doctrine/
   ```

4. Run ingestion:
   ```bash
   python main.py
   ```

5. **YAML** — Update `filters.source_doc` lists to your Arabic filenames.
   The current YAMLs filter retrieval to specific English filenames, like:
   ```yaml
   filters:
     source_doc:
       - "FM-5-0-Planning-and-Orders-Production.pdf"
       - "FM-6-0-Commander-Staff-Organization.pdf"
   ```
   If your Arabic files have different names (e.g. `manual_5_0_arabic.pdf`),
   these filters will match nothing and retrieval will return zero hits
   for those fields. You have two options:

   - **Option A (easier):** Rename your Arabic files so they match the
     existing filter strings exactly.
   - **Option B (cleaner):** Edit each `filters.source_doc:` block to
     list your Arabic filenames.

   Files that contain `filters.source_doc` lists today:
   - `prompts/initial_planning_guidance/template.yaml`
   - `prompts/staff_brief/template.yaml`
   - `templates/operation_order.yaml` (only if you re-enable it)
   - `templates/staff_estimate.yaml` (only if you re-enable it)

6. **YAML** (optional but strongly recommended for quality) — Translate
   `query_seeds` to Arabic. The current seeds are English:
   ```yaml
   query_seeds:
     - "MDMP staff coordination"
     - "commander information requirements"
   ```
   bge-m3 retrieves cross-language, so English seeds against an Arabic
   corpus still work — but same-language retrieval scores measurably
   higher. For best results, translate every retrieved field's
   `query_seeds` to Arabic:
   ```yaml
   query_seeds:
     - "تنسيق هيئة الركن في عملية صنع القرار العسكري"
     - "متطلبات معلومات القائد الحرجة"
   ```
   You can do this gradually — start with the documents whose retrieval
   feels weakest and translate seeds field-by-field.

7. Verify the gate accepted your files:
   ```bash
   ls output/not_enough/
   ```
   - **Empty:** every file passed the MDMP topic gate. Continue to step 10.
   - **Non-empty:** open
     `output/not_enough/<slug>/<stem>/check_decision.json` and read the
     `remark` field. Modern LLMs read Arabic fine, so wrong-topic
     rejections of Arabic MDMP material are rare. If they happen, follow
     §3 step 2 to broaden the gate prompt to clarify Arabic MDMP material
     is accepted.

8. **Edge case — OCR retry on Arabic-language rejection remarks.** The
   OCR retry only fires when the gate's rejection remark contains specific
   English keywords (`garbled`, `corrupt`, `unreadable`, etc.). If the gate
   LLM writes the rejection remark in Arabic for a corrupt scanned PDF,
   the retry won't trigger and the file stays rejected. Two workarounds:
   - Re-run with `FORCE_REPARSE=1` in `.env` to bypass the cache and
     force a re-parse.
   - Or **PROMPT**-edit `graph/prompts.py` `SUFFICIENCY_CHECK_SYSTEM_PROMPT`
     to require rejection remarks be written in English even for Arabic
     content.

9. **Quality note — post-processor metadata is sparser on Arabic.** Five
   post-processors run on each chunk:
   - paragraph number extractor
   - cross-reference extractor (looks for "FM 6-0", "ADP 5-0" style refs)
   - acronym expander (CCIR, PIR, BMNT, etc.)
   - classification stripper ("UNCLASSIFIED")
   - glossary splitter

   These were tuned for English doctrine. On Arabic content they still
   run, but they extract less metadata. Vector retrieval still works
   fine — it's based on embeddings, not metadata. But if any YAML filter
   depends on `paragraph_number:` or `cross_refs:` payload fields, those
   filters may match fewer chunks than they did with English content. If
   retrieval feels thin on a specific field, drop the metadata filters
   for that field and rely on vector + BM25 search alone.

10. Verify end to end:
    ```bash
    python -m graph.generation.template_loader     # all templates pass
    python scripts/generate_documents.py \
      --warning-order data/phase3_prompt_2.example.txt \
      --intel-report  data/phase3_prompt_3.example.txt \
      --docs time_analysis initial_planning_guidance staff_brief warning_order \
      --out /tmp/arabic_test
    ```
    Open the resulting `.docx` files. They should contain Arabic content
    drafted from your Arabic corpus, with citation tags pointing at your
    Arabic filenames.

### Edits required

- Install command (Tesseract language pack)
- **ENV** (`OCR_LANGS=eng+ara` — 1 line)
- **FILE-DROP** (Arabic files into the two corpus folders)
- **YAML** (`filters.source_doc` lists — required if filenames change)
- **YAML** (`query_seeds` lists — optional, recommended for quality)
- **PROMPT** (only if the gate misbehaves on Arabic — rare)

---

## 6. Replace or update a file

**Example:** A new revision of FM-6-0 came out and you want to swap it.

### Steps

1. **FILE-DROP** — Overwrite the file in place:
   ```bash
   cp ~/Downloads/FM-6-0-revised.pdf inputs/operationalfiles/FM-6-0-Commander-Staff-Organization.pdf
   ```
2. Run the pipeline:
   ```bash
   python main.py
   ```

### What happens automatically

The system detects the SHA-256 hash changed. It deletes the old file's
chunks from Qdrant and ingests the new content. Any cached document drafts
that depended on the old content are invalidated.

### Edits required

**Zero.** Just file drop + run.

---

## 7. Delete a file

**Example:** You want to remove a deprecated manual from the corpus.

### Steps

1. **FILE-DROP** — Delete the file from the input folder:
   ```bash
   rm inputs/operationalfiles/old_manual.pdf
   ```
2. Run the pipeline:
   ```bash
   python main.py
   ```

### Important

The pipeline does NOT automatically delete the old file's chunks from
Qdrant. They stay in the database forever unless you remove them manually.
If you want to clean them out, run a small cleanup script:

```python
from qdrant_client import QdrantClient
from qdrant_client.http import models

client = QdrantClient("localhost", port=6333)
client.delete(
    collection_name="ingest__operationalfiles__bgem3",
    points_selector=models.FilterSelector(
        filter=models.Filter(
            must=[
                models.FieldCondition(
                    key="source_doc",
                    match=models.MatchValue(value="old_manual.pdf"),
                )
            ]
        )
    ),
)
print("done")
```

### Edits required

- **FILE-DROP** (1)
- Optionally a one-off cleanup script if you care about removing stale data.

---

## 8. Generate fewer docs (one-time)

**Example:** For this run only, you want to generate just the time analysis
and warning order, not all four.

### Steps

Just pass the `--docs` flag with the subset you want:

```bash
python scripts/generate_documents.py \
  --warning-order data/phase3_prompt_2.example.txt \
  --intel-report data/phase3_prompt_3.example.txt \
  --docs time_analysis warning_order \
  --out /tmp/two_docs
```

In the Streamlit UI, just uncheck the boxes for documents you don't want.

### Edits required

**Zero.**

---

## 9. Permanently remove a document

**Example:** You decide `staff_brief` is not needed and want to retire it.

You have two paths.

### Path A: Hide it (soft removal — easy)

1. **YAML** — Open the document's template (e.g.
   `prompts/staff_brief/template.yaml`) and add at the very top:
   ```yaml
   v1_scope: false
   ```
2. The CLI and UI will now skip this document. Files stay on disk for
   future re-enabling.

### Path B: Actually remove it (full removal — medium)

You need to delete its registrations from 4 places.

1. **CODE** — `scripts/generate_documents.py`: remove the entry from
   `ALL_DOC_IDS`.
2. **CODE** — `ui/phase3_tab.py`: remove the entry from `V1_DOC_IDS` AND
   `V1_DOC_LABELS`.
3. **CODE** — `graph/generation/schema/inputs.py`: remove the matching field
   from class `DocumentSelection`.
4. **CODE** — `graph/generation/template_loader.py`: remove the entries from
   `TEMPLATE_ID_TO_SCHEMA_MODULE` AND `TEMPLATE_ID_TO_CATALOG_MODULES`.
5. **FILE-DROP** — Delete `prompts/staff_brief/` and (if it exists)
   `templates/staff_brief.yaml`.
6. (Optional) **CODE** — `scripts/smoke_y_schemas.py`: remove from
   `Y_INLINE_KEYS`.

### Verify

```bash
python -m graph.generation.template_loader      # all remaining templates pass
python scripts/smoke_y_schemas.py                # all remaining smokes pass
```

### Edits required

- Path A: **YAML** (1 line)
- Path B: **CODE** (5–6 small edits) + **FILE-DROP** (1 directory)

---

## 10. Add a new document type

**Example:** You want a brand-new fifth document called `mission_statement`
that the system should generate alongside the existing four.

This is the heaviest customization. Plan ~30–60 minutes the first time.

### Step 1 — Plan the document

Decide:
- **Document ID** (lowercase, underscores): `mission_statement`
- **Arabic title**: `بيان المهمة`
- **Schema**: what fields does this document have? List them.
- **Field kinds**: for each field, decide one of:
  - `static` — literal text from YAML
  - `input` — comes from `Phase3Inputs` (pre-existing input fields)
  - `computed` — calculated by Python helpers (e.g. dates)
  - `retrieved` — drafted by LLM from the corpus
  - `source_file_extracted` — extracted from the user's uploaded files

### Step 2 — Create the per-doc directory

**FILE-DROP** + **NEW-FILE**:
```bash
mkdir prompts/mission_statement
touch prompts/mission_statement/__init__.py
```

### Step 3 — Write the schema

**NEW-FILE** — `prompts/mission_statement/schema.py`:
```python
from pydantic import BaseModel, ConfigDict, Field

class MissionStatement(BaseModel):
    model_config = ConfigDict(extra="forbid")

    purpose: str = Field(description="The mission's overall purpose.")
    key_tasks: str = Field(description="Key tasks the unit will perform.")
    end_state: str = Field(description="The desired end state.")

DOCUMENT_CLASSES = (MissionStatement,)
```

> **Important:** `extra="forbid"` is required for compatibility with the
> drafter LLM. Don't remove it.

### Step 4 — Write the labels file

**NEW-FILE** — `prompts/mission_statement/labels_ar.py`:
```python
FIELD_LABELS_AR = {
    ("MissionStatement", "purpose"):    "الغرض من المهمة",
    ("MissionStatement", "key_tasks"):  "المهام الرئيسية",
    ("MissionStatement", "end_state"):  "الوضع النهائي المرغوب",
}
```

### Step 5 — Write the prompts file

**NEW-FILE** — `prompts/mission_statement/prompts_ar.py`:
```python
EXTRACTION_PROMPTS_AR = {
    # only needed if you have source_file_extracted fields
}

DRAFTING_PROMPTS_AR = {
    ("MissionStatement", "purpose"):    "اكتب الغرض من المهمة استناداً إلى المقاطع التالية:",
    ("MissionStatement", "key_tasks"):  "...",
    ("MissionStatement", "end_state"):  "...",
}
```

### Step 6 — Write the template YAML

**NEW-FILE** — `prompts/mission_statement/template.yaml`:
```yaml
meta:
  template_id: mission_statement
  template_version: 1
  title_arabic: "بيان المهمة"
  document_slug: mission_statement
  output_filename: "{document_slug}.docx"
  default_collections:
    - ingest__operationalfiles__bgem3

schemas:
  MissionStatement:
    fields:
      purpose:
        kind: retrieved
        group: Body
        query_seeds:
          - "mission purpose"
          - "commander's intent"
      key_tasks:
        kind: retrieved
        group: Body
        query_seeds:
          - "mission essential tasks"
      end_state:
        kind: retrieved
        group: Body
        query_seeds:
          - "desired end state"

structure:
  - kind: section
    schema: MissionStatement
    layout: y_initial_planning_guidance    # reuse an existing layout
```

### Step 7 — Register the document (4 small code edits)

**CODE** — `graph/generation/template_loader.py` (add 2 dict entries):
```python
TEMPLATE_ID_TO_SCHEMA_MODULE = {
    ...,
    "mission_statement": "prompts.mission_statement.schema",
}
TEMPLATE_ID_TO_CATALOG_MODULES = {
    ...,
    "mission_statement": (
        "prompts.mission_statement.labels_ar",
        "prompts.mission_statement.prompts_ar",
    ),
}
```

**CODE** — `scripts/generate_documents.py` (add 1 tuple entry):
```python
ALL_DOC_IDS = (
    ...,
    "mission_statement",
)
```

**CODE** — `ui/phase3_tab.py` (add 2 entries — only if you want UI access):
```python
V1_DOC_IDS = (..., "mission_statement")
V1_DOC_LABELS = {
    ...,
    "mission_statement": "Mission Statement — بيان المهمة",
}
```

**CODE** — `graph/generation/schema/inputs.py` (add 1 field to
`DocumentSelection`):
```python
class DocumentSelection(BaseModel):
    ...
    mission_statement: bool = True
```

### Step 8 — Renderer layout

You have two choices:

**Option A (easy):** Reuse an existing layout. In your `template.yaml` you
already wrote `layout: y_initial_planning_guidance`. No code change.

**Option B (advanced):** Write a custom layout. Open
`graph/generation/renderers/arabic_docx.py`, add a function
`_layout_y_mission_statement(...)` that mirrors the patterns of existing
`_layout_y_*` functions, and register it in `_LAYOUT_RENDERERS`.

### Step 9 — Verify offline

```bash
python -m graph.generation.template_loader
# Expect: 7/7 templates OK (or however many you now have)
```

### Step 10 — Verify live

```bash
python scripts/generate_documents.py \
  --warning-order data/phase3_prompt_2.example.txt \
  --intel-report  data/phase3_prompt_3.example.txt \
  --docs mission_statement \
  --out /tmp/test_new_doc
```

You should see `mission_statement.docx` in `/tmp/test_new_doc/`.

### Edits required

- **NEW-FILE** (5 files in `prompts/mission_statement/`)
- **CODE** (5–7 small registration entries)
- Optionally **CODE** for a custom renderer layout

---

## 11. Change collection wiring

**Example:** Document X currently reads only from operationalfiles, but you
want it to fall back to doctrine when operationalfiles is thin.

### Steps

**YAML** — Open the document's template and modify each retrieved field's
declaration:

```yaml
some_field:
  kind: retrieved
  group: SomeGroup
  policy: operationalfiles_then_doctrine          # <-- choose policy
  operationalfiles_collections:                   # <-- list OF collections
    - ingest__operationalfiles__bgem3
  doctrine_collections:                           # <-- list doctrine collections
    - ingest__doctrine__bgem3
  query_seeds:
    - "..."
```

### The six policies

| Policy | What it does |
|---|---|
| `operationalfiles_only` | Only operationalfiles. Default. |
| `doctrine_only` | Only doctrine. |
| `operationalfiles_then_doctrine` | OF first; if results are weak, also pull from doctrine. |
| `operationalfiles_and_doctrine` | Both unconditionally. |
| `all_channels` | OF + doctrine + uploaded source files. |
| `source_files_only` | Only the user's uploaded files. |

### Important rule

Every retrieved field in the same `group:` must declare the same `policy:`
(or all of them leave it blank). Otherwise the loader rejects the YAML.

### Edits required

- **YAML** only.

---

## 12. Tune retrieval behavior

### Turn the doctrine fallback off entirely (debugging)

**ENV** — Edit `.env`:
```
PHASE3_TIERED_RETRIEVAL=0
```
This forces every document to use the legacy operationalfiles-only path,
even if their YAMLs declare a tier-aware policy. To re-enable, set it back
to `1`.

### Make the "weak coverage" decision more or less strict

**ENV** — Edit `.env`:
```
PHASE3_COVERAGE_TAU_STRONG=0.30   # min top rerank score (higher = stricter)
PHASE3_COVERAGE_K_STRONG=8        # min number of results (higher = stricter)
PHASE3_COVERAGE_M_DOCS=2          # min number of distinct source documents
```

Or per-group in **YAML**:
```yaml
some_field:
  coverage_thresholds:
    tau_strong: 0.5
    k_strong: 12
    m_docs: 3
```

### Edits required

- **ENV** for global tuning, or **YAML** for per-group tuning.

---

## Combined cheat sheet

| What you want | What you actually edit |
|---|---|
| More files of the same topic | Drop and rerun. |
| New corpus, related topic | YAML collection lists. |
| New corpus, different topic | YAML + the gate prompt in `graph/prompts.py`. |
| Add a few non-English files alongside existing English ones | `.env` `OCR_LANGS` (and maybe gate prompt). |
| Switch the entire corpus to a different language (e.g. Arabic-only) | `.env` `OCR_LANGS` + YAML `filters.source_doc` + (optional) translate `query_seeds`. |
| Replace a file | Drop and rerun. |
| Delete a file | Delete + rerun (chunks linger unless you script the cleanup). |
| Generate a subset (one-time) | CLI `--docs` flag. Nothing to edit. |
| Generate fewer docs (permanent, soft) | Add `v1_scope: false` to the YAML. |
| Generate fewer docs (permanent, hard) | 5–6 small Python edits + delete files. |
| Add a brand-new document | 5 new files + 5–7 small Python edits. |
| Switch a doc to use doctrine fallback | YAML only. |
| Tune retrieval thresholds | `.env` or YAML. |

---

## Common pitfalls

1. **Folder names with spaces or capital letters** — they get auto-lowercased
   and special characters become underscores. Stick to lowercase letters,
   numbers, underscores, and hyphens for predictability.
2. **Files rejected at the gate** — check
   `output/not_enough/<slug>/<stem>/check_decision.json` to see why. Either
   improve the file's first 10 pages so the LLM can recognize the topic, or
   broaden the gate prompt (§3).
3. **YAML group consistency** — every retrieved field in the same group
   must declare the same `policy:`. Mixing policies inside a group fails
   loader validation.
4. **Stale Qdrant chunks after delete** — deleting a file from `inputs/`
   does NOT remove its chunks from Qdrant. Run the cleanup snippet in §7 if
   you care.
5. **Gemma drafter compliance** — if the LLM produces invalid output that
   fails Pydantic validation, the system has a built-in repair mechanism. If
   it still fails, switch off the Responses API as an escape hatch:
   `LLM_USE_RESPONSES_API=0` in `.env`.
6. **Always re-run the loader test after YAML edits**:
   ```bash
   python -m graph.generation.template_loader
   ```
   This catches typos and invariant violations before you waste time on a
   real generation run.

---

## Verification commands (run after any change)

```bash
# 1. Are all templates structurally valid?
python -m graph.generation.template_loader

# 2. Do the schema↔YAML pairs match?
python scripts/smoke_y_schemas.py

# 3. Does the architecture still pass offline smoke?
python scripts/tiered_retrieval_smoke.py

# 4. Does a real generation produce a clean .docx?
python scripts/generate_documents.py \
  --warning-order data/phase3_prompt_2.example.txt \
  --intel-report  data/phase3_prompt_3.example.txt \
  --docs <doc_id> \
  --out /tmp/verify
```

If all four pass, your customization works.

---

## Where things live (quick reference)

| What | Where |
|---|---|
| Input files (corpora) | `inputs/<folder>/` |
| Per-document templates (active) | `prompts/<doc_id>/` |
| Per-document templates (legacy) | `templates/<doc_id>.yaml` |
| Database admin | Qdrant at `http://localhost:6333` |
| Document generator script | `scripts/generate_documents.py` |
| Streamlit UI | `ui/app.py` (run with `streamlit run ui/app.py`) |
| Generated outputs | wherever `--out` points |
| Per-doc cache | `<output_dir>/.group_cache/` |
| Rejected-input bundles | `output/not_enough/<slug>/<stem>/` |
| Configuration | `.env` (copy from `.env.example` on a fresh clone) |
| MDMP topic gate | `graph/prompts.py::SUFFICIENCY_CHECK_SYSTEM_PROMPT` |
| Doc registrations | `scripts/generate_documents.py::ALL_DOC_IDS`, `ui/phase3_tab.py::V1_DOC_IDS`, `graph/generation/template_loader.py::TEMPLATE_ID_TO_*`, `graph/generation/schema/inputs.py::DocumentSelection` |
| Renderer layouts | `graph/generation/renderers/arabic_docx.py::_LAYOUT_RENDERERS` |

---

## When in doubt

1. Run `python -m graph.generation.template_loader` — if it fails, the error
   message tells you exactly what went wrong.
2. Read the `meta:` block of any existing template in `prompts/*/template.yaml`
   to see a working example of every field kind.
3. The four existing per-doc directories under `prompts/` are working
   reference implementations. Copy the simplest one (`prompts/time_analysis/`)
   as a starting point for new documents.
