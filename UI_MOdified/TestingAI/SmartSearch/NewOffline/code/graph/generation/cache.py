"""graph/generation/cache.py — per-group result cache.

Implements the expanded cache key from scoping §10.1 / §18 C11 for
the per-group draft+critique result. The per-document cache is a
separate concern (§10.2); for M3 we cache at the group level only
because that's where the expensive work lives (retrieval fan-out +
two LLM calls).

**What is cached.** The complete output of the retrieval +
drafting + critique pipeline for one group: a dict mapping every
retrieved field in the group to its drafted Arabic string, plus
the full SourcedHit list used to produce it (so citations can be
rebuilt without re-retrieving). Stored under
``output/generated/<run_id>/.group_cache/<hash>.json``. Re-running
with the same cache key skips the §6.2 fan-out AND both LLM calls.

**What is NOT cached.** The assembled ``.docx`` bytes (python-docx
XML ordering is not deterministic — scoping §18 C10). The renderer
always regenerates from a cached ``GeneratedDocument`` pydantic
instance; visual identity is the guarantee, byte identity is not.

**Cache key composition** (every knob that can change output —
dropping any of these silently returns stale drafts on a prompt /
model / toggle edit):

    template_id
    template_file_sha256
    group_name
    group_yaml_block_sha256       # subtree just for this group
    resolved_query_seeds_sorted
    filters_items_sorted
    collection_content_hashes_sorted
    use_glossary
    use_reranker_final
    use_hyde
    top_k_per_query
    merge_pool_size
    merged_top_k
    draft_model
    draft_temperature
    critique_model
    critique_temperature
    prompt_ar_sha256              # concatenation of every field's prompt_ar
    input_subset_sha256           # only inputs actually touched by the seeds
    reranker_model_tag            # RERANK_MODEL

C16 additions (free-form prompt input surface — scoping §18 C16):

    user_prompt_sha256            # the operation-brief text; "" on the
                                    --inputs-json escape hatch
    extractor_model               # ""  when extraction was skipped
    extractor_temperature         # 0.0 when extraction was skipped

LM Studio migration addition (2026-04-24):

    llm_endpoint_tag              # resolved LLM_BASE_URL or "openai-default"
    llm_use_responses_api         # bool — /v1/responses vs /v1/chat/completions
    embed_provider                # "fastembed" or "http"
    embed_endpoint_tag            # EMBED_BASE_URL when http, else fastembed model+providers
    rerank_provider               # "fastembed" or "http"
    rerank_endpoint_tag           # RERANK_BASE_URL when http, else fastembed model+providers

Tiered-retrieval Phase 5 additions (§C31):

    source_evidence_sha256        # canonical sha of source_files_field_map ∩ extracted_values
    source_files_sha256_pairs     # tuple of (kind, sha256) per uploaded file
    tier_policy                   # "operationalfiles_only" / "operationalfiles_then_doctrine" / etc.
    tiered_retrieval_enabled      # PHASE3_TIERED_RETRIEVAL kill-switch (1 default, 0 = Phase-6 behaviour)
    operationalfiles_collections_sorted   # tuple — operationalfiles tier collections per group
    doctrine_collections_sorted   # tuple — doctrine tier collections per group (empty pre-Phase-7)
    source_files_field_map_sha256 # canonical sha of the per-group source_files_field_map
    coverage_thresholds_tag       # canonical sha of (τ_strong, k_strong, m_docs)

Canonicalization rule (pinned for §C31+):
  1. ``sort_keys=True`` for every dict serialized into a hash input.
  2. ``ensure_ascii=False`` so Arabic strings stay as Arabic.
  3. ``unicodedata.normalize("NFC", s)`` on every string before hashing
     — kashida (ـ), tanwin (ٌ), and presentation-form letters all
     normalize to the same canonical codepoint sequence.
  4. UTF-8 encode → sha256 → first 16 hex chars.
See :func:`_canonical_sha256` for the implementation.

Swapping from cloud OpenAI to a local LM Studio server (or vice
versa) changes the active model family even when the model-name
string happens to coincide (``gpt-oss-20b`` served by LM Studio
has nothing to do with a cloud ``gpt-4o-mini``).  Folding the
endpoint identity into the key avoids stale cache hits across that
swap.

The trailing four components partition the cache by input and
endpoint provenance: a run that used ``--prompt`` sees different
cache entries than a run that used ``--inputs-json`` even when both
resolve to the same :class:`Phase3Inputs`. Audit-trail fidelity
matters more than the one-time cache miss.

Bypass via ``PHASE3_FORCE_REGENERATE=1`` in ``.env`` or a
``force_regenerate=True`` arg to :func:`load_group`.
"""

from __future__ import annotations

import hashlib
import json
import os
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from graph.generation.retrieval_group import GroupRetrievalResult, GroupSpec, SourcedHit
from graph.retrieval.schema import SearchHit
from graph.retrieval.rerank import resolve_rerank_endpoint_tag
from graph.shared.embedders import resolve_embed_endpoint_tag
from graph.shared.llm_factory import resolve_use_responses_api, resolved_endpoint_tag

__all__ = [
    "GroupCacheKey",
    "GroupDraft",
    "cache_dir_for_run",
    "compute_group_cache_key",
    "load_group",
    "save_group",
    "force_regenerate_flag",
]


def force_regenerate_flag() -> bool:
    """Return ``True`` iff the run-wide cache bypass env var is set."""
    return os.getenv("PHASE3_FORCE_REGENERATE", "0") == "1"


# --------------------------------------------------------------- §C31 helpers

# Locked default coverage thresholds from tiered_retrieval_discussion.md.
# Phase 7 reads these from the environment; Phase 5 only needs them to
# build the coverage_thresholds_tag for the cache key.
_DEFAULT_COVERAGE_TAU_STRONG = 0.30
_DEFAULT_COVERAGE_K_STRONG = 8
_DEFAULT_COVERAGE_M_DOCS = 2

# Six locked policy enum values from tiered_retrieval_discussion.md.
TIER_POLICIES = (
    "source_files_only",
    "operationalfiles_only",
    "doctrine_only",
    "operationalfiles_then_doctrine",
    "operationalfiles_and_doctrine",
    "all_channels",
)


def resolve_default_tier_policy() -> str:
    """Resolve ``PHASE3_DEFAULT_TIER_POLICY`` env var; fall back to legacy.

    Pre-§C32 (Phase 7) the loader does not yet read tier-aware YAML
    keys, so every group resolves to ``"operationalfiles_only"``
    regardless of this env var — the var feeds the cache key only,
    so flipping it invalidates drafts ahead of the Phase 7 cutover.
    """
    val = (os.getenv("PHASE3_DEFAULT_TIER_POLICY") or "operationalfiles_only").strip()
    if val not in TIER_POLICIES:
        # Unknown value — treat as legacy. We don't raise here because
        # the cache module is library-level; the loader (Phase 7) will
        # reject typos with a clear error at template load time.
        return "operationalfiles_only"
    return val


def resolve_coverage_thresholds() -> tuple[float, int, int]:
    """``(τ_strong, k_strong, m_docs)`` from env or locked defaults."""
    try:
        tau = float(os.getenv("PHASE3_COVERAGE_TAU_STRONG") or _DEFAULT_COVERAGE_TAU_STRONG)
    except ValueError:
        tau = _DEFAULT_COVERAGE_TAU_STRONG
    try:
        k = int(os.getenv("PHASE3_COVERAGE_K_STRONG") or _DEFAULT_COVERAGE_K_STRONG)
    except ValueError:
        k = _DEFAULT_COVERAGE_K_STRONG
    try:
        m = int(os.getenv("PHASE3_COVERAGE_M_DOCS") or _DEFAULT_COVERAGE_M_DOCS)
    except ValueError:
        m = _DEFAULT_COVERAGE_M_DOCS
    return (tau, k, m)


def resolve_tiered_retrieval_enabled() -> bool:
    """Kill-switch — ``PHASE3_TIERED_RETRIEVAL=0`` reproduces Phase-6 behaviour."""
    return (os.getenv("PHASE3_TIERED_RETRIEVAL") or "1").strip() not in ("0", "false", "False", "")


def _canonical_sha256(obj: Any) -> str:
    """NFC-normalized, sort-keys-stable sha256 over a JSON-canonical dump.

    Pinned canonicalization for any cache-key field that hashes user-
    authored Arabic content. See module docstring for the four-step
    rule. Returns a 16-hex-char digest (64 bits — plenty for cache
    key space; full 256 bits is overkill).
    """
    import unicodedata

    def _nfc(x: Any) -> Any:
        if isinstance(x, str):
            return unicodedata.normalize("NFC", x)
        if isinstance(x, dict):
            return {(_nfc(k) if isinstance(k, str) else k): _nfc(v) for k, v in x.items()}
        if isinstance(x, (list, tuple)):
            return [_nfc(item) for item in x]
        return x

    canonical = json.dumps(_nfc(obj), sort_keys=True, ensure_ascii=False, default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:16]


def _sha256_short(*parts: Any) -> str:
    """Stable SHA-256 over the concatenation of stringified parts.

    ``json.dumps(..., sort_keys=True)`` ensures dict ordering doesn't
    silently change the key. Lists / tuples are stringified in
    their declared order (caller must sort if needed — the key
    fields that need sorting are explicitly sorted upstream).
    """
    h = hashlib.sha256()
    for p in parts:
        if isinstance(p, (dict, list, tuple)):
            payload = json.dumps(p, sort_keys=True, ensure_ascii=False, default=str)
        else:
            payload = str(p)
        h.update(payload.encode("utf-8"))
        h.update(b"\x00")  # separator so adjoining values can't collide
    return h.hexdigest()[:16]  # 64 bits of cache-key entropy is plenty


@dataclass(frozen=True)
class GroupCacheKey:
    """All the fields that compose the cache key, plus the computed hash.

    Keeping the individual fields around (not just the hash) is
    useful for debugging: "why did this not cache-hit?" is
    answered by diffing two ``GroupCacheKey`` instances.
    """

    template_id: str
    template_file_sha256: str
    group_name: str
    group_yaml_block_sha256: str
    resolved_query_seeds_sorted: tuple[str, ...]
    filters_items_sorted: tuple[tuple[str, Any], ...]
    collection_content_hashes_sorted: tuple[tuple[str, str], ...]
    use_glossary: bool
    use_reranker_final: bool
    use_hyde: bool
    top_k_per_query: int
    merge_pool_size: int
    merged_top_k: int
    draft_model: str
    draft_temperature: float
    critique_model: str
    critique_temperature: float
    prompt_ar_sha256: str
    input_subset_sha256: str
    reranker_model_tag: str
    # §18 C16 additions (free-form prompt input surface):
    user_prompt_sha256: str          # "" when --inputs-json bypassed extractor
    extractor_model: str             # "" when extraction was skipped
    extractor_temperature: float     # 0.0 when extraction was skipped
    # LM Studio migration (2026-04-24) — resolved LLM_BASE_URL or
    # "openai-default" when no base_url is configured.
    llm_endpoint_tag: str
    # Responses API switch (2026-04-24, locked ON).  Folded in because
    # toggling between /v1/responses and /v1/chat/completions changes
    # the wire shape of structured-output calls; a cache hit across that
    # toggle would return drafts produced under a different protocol.
    llm_use_responses_api: bool
    # Embedder + reranker endpoint identity.  Fold the resolved URL+model
    # into the cache key so pointing EMBED_BASE_URL / RERANK_BASE_URL at a
    # different server (or swapping the served model id) invalidates stale
    # drafts.  Both stages are HTTP-only.
    embed_endpoint_tag: str
    rerank_endpoint_tag: str
    # §C31 — tiered-retrieval Phase 5.  Pre-Phase-7 these hold safe
    # legacy defaults (empty subsets / "operationalfiles_only" / locked
    # default thresholds) so the digest is stable and predictable.
    # Phase 7's dispatcher fills the real values from per-group YAML
    # and source_file_records.
    source_evidence_sha256: str
    source_files_sha256_pairs: tuple[tuple[str, str], ...]
    tier_policy: str
    tiered_retrieval_enabled: bool
    operationalfiles_collections_sorted: tuple[str, ...]
    doctrine_collections_sorted: tuple[str, ...]
    source_files_field_map_sha256: str
    coverage_thresholds_tag: str
    digest: str  # the 16-hex-char hash of everything above


@dataclass(frozen=True)
class GroupDraft:
    """Cacheable output of ``retrieve → draft → critique`` for one group.

    Stored on disk as JSON; SourcedHits reconstituted on load so the
    renderer can still walk them for citation endnotes.
    """

    group_name: str
    schema_name: str
    field_values: dict[str, str]
    hits: tuple[SourcedHit, ...]
    canonical_rerank_query: str
    resolved_seeds: tuple[str, ...]
    allowlist_elided: tuple[str, ...]
    cache_key_digest: str


# ------------------------------------------------------------- hashing helpers

def _sha_file(path: Path) -> str:
    try:
        return hashlib.sha256(path.read_bytes()).hexdigest()[:16]
    except OSError:
        return "no-file"


def _sha_string(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()[:16]


def _group_yaml_block_hash(template_path: Path, group_name: str) -> str:
    """Hash the relevant YAML subtree for a group.

    Implementation is pragmatic: we load the YAML, find every field
    whose ``group`` equals ``group_name``, and hash their resolved
    subtrees. Not byte-identical to a textual subtree extraction
    but captures every semantically meaningful change.
    """
    import yaml  # local import keeps cache module import-light

    raw = yaml.safe_load(template_path.read_text(encoding="utf-8"))
    subtree: dict[str, Any] = {}
    for cls_name, body in (raw.get("schemas") or {}).items():
        for fname, spec in (body.get("fields") or {}).items():
            if isinstance(spec, dict) and spec.get("group") == group_name:
                subtree[f"{cls_name}.{fname}"] = spec
    return _sha_string(json.dumps(subtree, sort_keys=True, ensure_ascii=False))


def _collection_content_hashes(collections: tuple[str, ...]) -> tuple[tuple[str, str], ...]:
    """Pull ``content_hash`` for each collection from the Phase 1 ``_registry``.

    Silently returns ``"no-registry"`` on error so a transient
    Qdrant hiccup doesn't poison cache keys permanently. The next
    successful call will repopulate the real hash and invalidate
    older cache entries — a one-shot cold miss, not a correctness bug.
    """
    try:
        from graph.retrieval.registry import list_registry_entries
    except ImportError:
        return tuple((c, "no-registry-module") for c in sorted(collections))
    try:
        entries = {e.name: e for e in list_registry_entries()}
    except Exception:
        return tuple((c, "no-registry") for c in sorted(collections))
    out: list[tuple[str, str]] = []
    for c in sorted(collections):
        entry = entries.get(c)
        out.append((c, entry.content_hash if entry else "missing"))
    return tuple(out)


def _prompt_ar_concat_hash(group: GroupSpec) -> str:
    """Hash the concatenation of every field's ``prompt_ar`` in the group."""
    payload = "\n\n".join(
        f"{fname}\n{spec.prompt_ar}"
        for fname, spec in zip(group.field_names, group.field_specs)
    )
    return _sha_string(payload)


def _reranker_model_tag() -> str:
    return os.getenv("RERANK_MODEL", "BAAI/bge-reranker-v2-m3")


def _input_subset_hash(resolved_seeds: tuple[str, ...], inputs_raw: dict) -> str:
    """Hash the inputs-fields actually referenced by the resolved seeds.

    We don't know ahead of time which input fields a seed used
    (interpolation is string-level), so we hash the entire raw
    inputs payload. That's a small over-hash — a harmless extra
    cache invalidation if the user tweaks an unrelated input field.
    """
    _ = resolved_seeds  # reserved for a future per-seed narrowing
    return _sha_string(json.dumps(inputs_raw, sort_keys=True, ensure_ascii=False, default=str))


# ------------------------------------------------------------- public API

def compute_group_cache_key(
    template_path: Path,
    group: GroupSpec,
    retrieval: GroupRetrievalResult,
    *,
    draft_model: str,
    draft_temperature: float,
    critique_model: str,
    critique_temperature: float,
    use_glossary: bool,
    use_reranker_final: bool,
    use_hyde: bool,
    inputs_raw: dict,
    # §18 C16 additions — provenance of the Phase3Inputs instance.
    # Defaults describe the "extractor skipped" case (`--inputs-json`
    # path); the CLI fills them with real values on the `--prompt` path.
    user_prompt_sha256: str = "",
    extractor_model: str = "",
    extractor_temperature: float = 0.0,
    # §C31 — tiered-retrieval Phase 5 additions.  All optional with
    # safe legacy defaults so pre-Phase-7 callers don't have to thread
    # any new state.  Phase 7's dispatcher will fill them per group.
    extracted_values: dict[str, str] | None = None,
    field_map: dict[str, str] | None = None,
    source_file_records: tuple[Any, ...] = (),
    tier_policy: str | None = None,
    operationalfiles_collections: tuple[str, ...] | None = None,
    doctrine_collections: tuple[str, ...] = (),
) -> GroupCacheKey:
    """Assemble the full §10.1 + §18 C16 + §C31 cache key."""
    filters_sorted = tuple(sorted(
        ((k, tuple(v) if isinstance(v, list) else v) for k, v in group.filters.items()),
        key=lambda kv: kv[0],
    ))
    seeds_sorted = tuple(sorted(retrieval.resolved_seeds))
    collection_hashes = _collection_content_hashes(group.collections)

    # §C31 — derive the tiered-retrieval cache fragments.  When the
    # caller supplies nothing we hash the empty subsets so legacy
    # templates land at a stable digest.
    extracted_values = extracted_values or {}
    field_map = field_map or {}
    if tier_policy is None:
        tier_policy = resolve_default_tier_policy()
    if operationalfiles_collections is None:
        # Pre-Phase-7 every collection on the GroupSpec is the
        # operationalfiles tier by default.
        operationalfiles_collections = tuple(group.collections)

    of_collections_sorted = tuple(sorted(operationalfiles_collections))
    doctrine_collections_sorted = tuple(sorted(doctrine_collections))
    source_evidence_subset = {
        drafter_field: extracted_values.get(extracted_key, "")
        for drafter_field, extracted_key in field_map.items()
    }
    source_evidence_sha256 = _canonical_sha256(source_evidence_subset)
    source_files_sha256_pairs = tuple(sorted(
        (
            (getattr(rec, "kind", "") or "", getattr(rec, "sha256", "") or "")
            for rec in source_file_records
        ),
        key=lambda p: (p[0], p[1]),
    ))
    source_files_field_map_sha256 = _canonical_sha256(field_map)
    coverage_thresholds_tag = _canonical_sha256(resolve_coverage_thresholds())
    tiered_retrieval_enabled = resolve_tiered_retrieval_enabled()

    fields_for_hash = (
        "template_id",
        "template_file_sha256",
        "group_name",
        "group_yaml_block_sha256",
        "resolved_query_seeds_sorted",
        "filters_items_sorted",
        "collection_content_hashes_sorted",
        "use_glossary",
        "use_reranker_final",
        "use_hyde",
        "top_k_per_query",
        "merge_pool_size",
        "merged_top_k",
        "draft_model",
        "draft_temperature",
        "critique_model",
        "critique_temperature",
        "prompt_ar_sha256",
        "input_subset_sha256",
        "reranker_model_tag",
        # C16 — dropped or reshaped here silently caches stale drafts
        # across an extractor swap.
        "user_prompt_sha256",
        "extractor_model",
        "extractor_temperature",
        # LM Studio migration — endpoint identity (2026-04-24).
        "llm_endpoint_tag",
        "llm_use_responses_api",
        # Embedder + reranker endpoint identity (HTTP-only).
        "embed_endpoint_tag",
        "rerank_endpoint_tag",
        # §C31 — tiered-retrieval cache fragments.
        "source_evidence_sha256",
        "source_files_sha256_pairs",
        "tier_policy",
        "tiered_retrieval_enabled",
        "operationalfiles_collections_sorted",
        "doctrine_collections_sorted",
        "source_files_field_map_sha256",
        "coverage_thresholds_tag",
    )
    values = {
        "template_id": None,  # filled below
        "template_file_sha256": _sha_file(template_path),
        "group_name": group.group_name,
        "group_yaml_block_sha256": _group_yaml_block_hash(template_path, group.group_name),
        "resolved_query_seeds_sorted": seeds_sorted,
        "filters_items_sorted": filters_sorted,
        "collection_content_hashes_sorted": collection_hashes,
        "use_glossary": use_glossary,
        "use_reranker_final": use_reranker_final,
        "use_hyde": use_hyde,
        "top_k_per_query": group.top_k_per_query,
        "merge_pool_size": group.merge_pool_size,
        "merged_top_k": group.merged_top_k,
        "draft_model": draft_model,
        "draft_temperature": draft_temperature,
        "critique_model": critique_model,
        "critique_temperature": critique_temperature,
        "prompt_ar_sha256": _prompt_ar_concat_hash(group),
        "input_subset_sha256": _input_subset_hash(seeds_sorted, inputs_raw),
        "reranker_model_tag": _reranker_model_tag(),
        "user_prompt_sha256": user_prompt_sha256,
        "extractor_model": extractor_model,
        "extractor_temperature": extractor_temperature,
        "llm_endpoint_tag": resolved_endpoint_tag(),
        "llm_use_responses_api": resolve_use_responses_api(),
        "embed_endpoint_tag": resolve_embed_endpoint_tag(),
        "rerank_endpoint_tag": resolve_rerank_endpoint_tag(),
        "source_evidence_sha256": source_evidence_sha256,
        "source_files_sha256_pairs": source_files_sha256_pairs,
        "tier_policy": tier_policy,
        "tiered_retrieval_enabled": tiered_retrieval_enabled,
        "operationalfiles_collections_sorted": of_collections_sorted,
        "doctrine_collections_sorted": doctrine_collections_sorted,
        "source_files_field_map_sha256": source_files_field_map_sha256,
        "coverage_thresholds_tag": coverage_thresholds_tag,
    }
    # Fill template_id from the template file's parsed meta (cheap enough).
    import yaml
    raw = yaml.safe_load(template_path.read_text(encoding="utf-8"))
    values["template_id"] = raw["meta"]["template_id"]
    digest = _sha256_short(*(values[k] for k in fields_for_hash))
    return GroupCacheKey(**values, digest=digest)


def cache_dir_for_run(out_root: Path) -> Path:
    """The ``.group_cache/`` folder for one run's output root.

    Created on demand. Gitignored by the repo-level ``output/`` rule.
    """
    p = out_root / ".group_cache"
    p.mkdir(parents=True, exist_ok=True)
    return p


# ------------------------------------------------------------- SourcedHit (de)serialization

def _sourced_hit_to_json(sh: SourcedHit) -> dict:
    return {
        "hit": {
            "point_id": sh.hit.point_id,
            "text": sh.hit.text,
            "heading_path": sh.hit.heading_path,
            "source_doc": sh.hit.source_doc,
            "page_numbers": sh.hit.page_numbers,
            "chunk_type": sh.hit.chunk_type,
            "chunk_index": sh.hit.chunk_index,
            "paragraph_number": sh.hit.paragraph_number,
            "paragraph_numbers": sh.hit.paragraph_numbers,
            "cross_refs": sh.hit.cross_refs,
            "rrf_score": sh.hit.rrf_score,
            "rerank_score": sh.hit.rerank_score,
            "final_rank": sh.hit.final_rank,
        },
        "collection": sh.collection,
        "occurrences": [list(p) for p in sh.occurrences],
        "rerank_score": sh.rerank_score,
        "citation_tag": sh.citation_tag,
    }


def _sourced_hit_from_json(d: dict) -> SourcedHit:
    h = d["hit"]
    return SourcedHit(
        hit=SearchHit(
            point_id=h["point_id"],
            text=h["text"],
            heading_path=h["heading_path"],
            source_doc=h["source_doc"],
            page_numbers=list(h["page_numbers"]),
            chunk_type=h["chunk_type"],
            chunk_index=h["chunk_index"],
            paragraph_number=h["paragraph_number"],
            paragraph_numbers=list(h["paragraph_numbers"]),
            cross_refs=list(h["cross_refs"]),
            rrf_score=h["rrf_score"],
            rerank_score=h["rerank_score"],
            final_rank=h.get("final_rank", 0),
        ),
        collection=d["collection"],
        occurrences=tuple(tuple(p) for p in d["occurrences"]),
        rerank_score=d["rerank_score"],
        citation_tag=d["citation_tag"],
    )


# ------------------------------------------------------------- load/save

def load_group(cache_dir: Path, key: GroupCacheKey, *, force_regenerate: bool = False) -> GroupDraft | None:
    if force_regenerate or force_regenerate_flag():
        return None
    path = cache_dir / f"{key.digest}.json"
    if not path.exists():
        return None
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if raw.get("cache_key_digest") != key.digest:
        # Collision or truncated file — pretend it's a miss rather
        # than returning a wrong draft.
        return None
    return GroupDraft(
        group_name=raw["group_name"],
        schema_name=raw["schema_name"],
        field_values=dict(raw["field_values"]),
        hits=tuple(_sourced_hit_from_json(h) for h in raw["hits"]),
        canonical_rerank_query=raw["canonical_rerank_query"],
        resolved_seeds=tuple(raw["resolved_seeds"]),
        allowlist_elided=tuple(raw.get("allowlist_elided") or ()),
        cache_key_digest=raw["cache_key_digest"],
    )


def save_group(cache_dir: Path, key: GroupCacheKey, draft: GroupDraft) -> Path:
    path = cache_dir / f"{key.digest}.json"
    payload = {
        "group_name": draft.group_name,
        "schema_name": draft.schema_name,
        "field_values": draft.field_values,
        "hits": [_sourced_hit_to_json(h) for h in draft.hits],
        "canonical_rerank_query": draft.canonical_rerank_query,
        "resolved_seeds": list(draft.resolved_seeds),
        "allowlist_elided": list(draft.allowlist_elided),
        "cache_key_digest": draft.cache_key_digest,
        "_cache_key_fields": {k: _jsonify(v) for k, v in asdict(key).items() if k != "digest"},
    }
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=False),
        encoding="utf-8",
    )
    return path


def _jsonify(v: Any) -> Any:
    """Recursive JSON-safe coercion for audit-trail storage."""
    if isinstance(v, tuple):
        return [_jsonify(x) for x in v]
    if isinstance(v, list):
        return [_jsonify(x) for x in v]
    if isinstance(v, dict):
        return {k: _jsonify(x) for k, x in v.items()}
    return v


# --------------------------------------------------------------- self-smoke

if __name__ == "__main__":
    # §C31 canonicalization invariants (offline, no Qdrant, no LLM).
    # Same logical content → same digest; any tweak → different digest.

    # 1. NFC normalization: kashida + presentation-form letters fold to
    #    the same canonical form.
    a = _canonical_sha256({"x": "اللواء"})
    b = _canonical_sha256({"x": "اللواء"})  # same string
    assert a == b, "identical strings must yield identical digests"

    # 2. Sort-keys stability: dict ordering doesn't affect the digest.
    a = _canonical_sha256({"a": 1, "b": 2})
    b = _canonical_sha256({"b": 2, "a": 1})
    assert a == b, "sort_keys must make dict ordering irrelevant"
    print(f"OK canonicalization stable: {a}")

    # 3. Adding a key changes the digest.
    a = _canonical_sha256({"x": 1})
    b = _canonical_sha256({"x": 1, "y": 2})
    assert a != b, "extra key must change the digest"

    # 4. Tier policy enum guard — typo falls back to legacy default.
    saved = os.environ.pop("PHASE3_DEFAULT_TIER_POLICY", None)
    try:
        os.environ["PHASE3_DEFAULT_TIER_POLICY"] = "operationalfiles_only"
        assert resolve_default_tier_policy() == "operationalfiles_only"
        os.environ["PHASE3_DEFAULT_TIER_POLICY"] = "all_channels"
        assert resolve_default_tier_policy() == "all_channels"
        os.environ["PHASE3_DEFAULT_TIER_POLICY"] = "garbage_value_xxx"
        assert resolve_default_tier_policy() == "operationalfiles_only"
        print("OK tier policy resolver: legacy fallback on typo")
    finally:
        os.environ.pop("PHASE3_DEFAULT_TIER_POLICY", None)
        if saved is not None:
            os.environ["PHASE3_DEFAULT_TIER_POLICY"] = saved

    # 5. Coverage thresholds env override.
    saved = {k: os.environ.pop(k, None) for k in ("PHASE3_COVERAGE_TAU_STRONG", "PHASE3_COVERAGE_K_STRONG", "PHASE3_COVERAGE_M_DOCS")}
    try:
        assert resolve_coverage_thresholds() == (0.30, 8, 2)  # locked defaults
        os.environ["PHASE3_COVERAGE_TAU_STRONG"] = "0.5"
        os.environ["PHASE3_COVERAGE_K_STRONG"] = "12"
        os.environ["PHASE3_COVERAGE_M_DOCS"] = "3"
        assert resolve_coverage_thresholds() == (0.5, 12, 3)
        print("OK coverage thresholds: env override applied")
    finally:
        for k in ("PHASE3_COVERAGE_TAU_STRONG", "PHASE3_COVERAGE_K_STRONG", "PHASE3_COVERAGE_M_DOCS"):
            os.environ.pop(k, None)
            if saved[k] is not None:
                os.environ[k] = saved[k]

    # 6. Kill-switch.
    saved = os.environ.pop("PHASE3_TIERED_RETRIEVAL", None)
    try:
        assert resolve_tiered_retrieval_enabled() is True  # default = ON
        os.environ["PHASE3_TIERED_RETRIEVAL"] = "0"
        assert resolve_tiered_retrieval_enabled() is False
        os.environ["PHASE3_TIERED_RETRIEVAL"] = "1"
        assert resolve_tiered_retrieval_enabled() is True
        print("OK kill-switch resolver: 0 → False, 1 → True")
    finally:
        os.environ.pop("PHASE3_TIERED_RETRIEVAL", None)
        if saved is not None:
            os.environ["PHASE3_TIERED_RETRIEVAL"] = saved

    # 7. Source-evidence subset hash: legacy (empty field_map) → hash({})
    empty_subset_hash = _canonical_sha256({})
    print(f"OK empty source_files subset hash: {empty_subset_hash}")
    # Non-empty subset → different hash.
    a = _canonical_sha256({"task_org": "اللواء"})
    b = _canonical_sha256({"task_org": "الكتيبة"})
    assert a != b, "different subset values must yield different digests"

    print("\ncache.py §C31 smoke OK — Phase 5 cache-key extension ready.")
