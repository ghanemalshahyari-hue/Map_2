"""
graph/builder.py
================
Assembles and compiles the 7-node ingestion graph.

WHAT IS A LANGGRAPH GRAPH?
  LangGraph lets you define a workflow as a directed graph — nodes are functions,
  edges are the paths between them.  At runtime, LangGraph executes each node
  in order, passing the shared state dict from node to node.

  After each node runs, its return dict is MERGED into the shared state.
  The next node then reads from that updated state.

THE 7-NODE PIPELINE (added initialpages_convert on 2026-04-20):

  START
    │
    ▼
  initialpages_convert   (Docling first-10-pages probe → markdown on disk)
    │
    ▼
  check_documents        (LLM gate — reads the markdown previews)
    │
    │  decision == "not enough"
    ├────────────────────────────────────────────────→ END
    │
    │  decision == "enough"
    ▼
  convert_document       (Docling full parse → JSON on disk)
    │
    ▼
  chunk_document         (HybridChunker → all_chunks.jsonl)
    │
    ▼
  enrich_chunks          (5 doctrine post-processors → enriched_chunks.jsonl)
    │
    ▼
  embed_chunks           (bge-m3 dense + BM25 sparse → per-doc .npz files)
    │
    ▼
  upsert_to_qdrant       (hash-gated upsert → Qdrant collection + _registry)
    │
    ▼
   END

WHY initialpages_convert EXISTS:
  LangChain's `ChatOpenAI` can only be fed text.  Previously `check_documents`
  saw the placeholder "[Binary document — content to be extracted]" for every
  PDF/DOCX and had no way to judge topic.  initialpages_convert runs Docling
  on pages 1..10 of each doc, dumps markdown, and check_documents reads that
  instead.  See graph/nodes/initialpages_convert.py for the full rationale.

CONDITIONAL EDGE:
  check_documents returns state["decision"] == "enough" or "not enough".
  The routing function reads that field and returns the name of the next
  node ("convert_document") or the special END sentinel.

  Using a routing lambda keeps the routing logic visible here in builder.py
  rather than hidden inside the node itself.
"""
from __future__ import annotations

from langgraph.graph import StateGraph, END, START

from graph.state import IngestionState
from graph.nodes.initialpages_convert import initialpages_convert
from graph.nodes.check_documents      import check_documents
from graph.nodes.convert_document     import convert_document
from graph.nodes.chunk_document       import chunk_document
from graph.nodes.enrich_chunks        import enrich_chunks
from graph.nodes.embed_chunks         import embed_chunks
from graph.nodes.upsert_to_qdrant     import upsert_to_qdrant


def _route_after_check(state: IngestionState) -> str:
    """
    Routing function called after check_documents.

    Returns the name of the next node if the documents are sufficient,
    or END if they are not.

    LangGraph uses the return value of this function to pick which edge to
    follow.  The values must match the keys in the edges dict below.
    """
    if state.get("decision") == "enough":
        return "convert_document"
    return END


def build_graph():
    """
    Build and compile the ingestion StateGraph.

    Returns a compiled LangGraph app.  Call app.invoke(initial_state) to
    run the full pipeline against one folder.

    The graph is compiled once and can be reused across multiple folders —
    compilation validates the graph structure (no missing nodes, no dead edges)
    and is slightly expensive, so we do it once in main.py.
    """
    # StateGraph(IngestionState) tells LangGraph to use IngestionState as the
    # shared state TypedDict.  Every node receives and returns from this schema.
    graph = StateGraph(IngestionState)

    # --- Register nodes ---
    # Each call binds a name (used in edges) to a callable (the node function).
    graph.add_node("initialpages_convert", initialpages_convert)
    graph.add_node("check_documents",      check_documents)
    graph.add_node("convert_document",     convert_document)
    graph.add_node("chunk_document",       chunk_document)
    graph.add_node("enrich_chunks",        enrich_chunks)
    graph.add_node("embed_chunks",         embed_chunks)
    graph.add_node("upsert_to_qdrant",     upsert_to_qdrant)

    # --- Entry point ---
    # START is a LangGraph sentinel; the first node always receives the
    # initial_state dict passed to app.invoke().  initialpages_convert runs
    # BEFORE the gate so the gate has real content to read.
    graph.add_edge(START,                  "initialpages_convert")
    graph.add_edge("initialpages_convert", "check_documents")

    # --- Conditional edge after the LLM gate ---
    # add_conditional_edges(source, routing_fn, edge_map):
    #   source     : the node whose output triggers the routing decision
    #   routing_fn : called with the current state; must return a key from edge_map
    #   edge_map   : maps routing_fn return values to destination node names
    graph.add_conditional_edges(
        "check_documents",
        _route_after_check,
        {
            "convert_document": "convert_document",  # "enough" path
            END:                END,                 # "not enough" path
        },
    )

    # --- Linear edges for the remaining 5 nodes ---
    graph.add_edge("convert_document", "chunk_document")
    graph.add_edge("chunk_document",   "enrich_chunks")
    graph.add_edge("enrich_chunks",    "embed_chunks")
    graph.add_edge("embed_chunks",     "upsert_to_qdrant")
    graph.add_edge("upsert_to_qdrant", END)

    # compile() validates the graph and returns an executable app.
    return graph.compile()
