# Prompt to paste into Claude on the Linux machine

Copy everything between the lines below into your first message to Claude on the Linux machine. Replace `~/wargame` with wherever you actually put the transferred files.

---

I'm setting up a doctrine-driven wargame simulator that I previously had running on Mac. The goal on this Linux machine: bring the **smart-search + wargame-generation pipeline** online and produce CSV + Markdown + GeoJSON outputs. The 3D Unity visualization is OUT OF SCOPE for now.

## What's in the project

I've placed two project directories at `~/wargame/`:
- `~/wargame/DecisionMakingSteps_TRANSFER/` — RAG smart-search system (Qdrant + bge-m3 embedder, LangGraph-based). **DO NOT MODIFY any code under this directory** — only `.env` and `inputs/doctrine/` corpus are mine to touch. The smart-search system is already designed and tested; we just need to get it running.
- `~/wargame/WarGameGenerator/` — the wargame orchestrator that uses smart-search as a client. This is where my code lives. I can modify it freely.

## What I need from you

Read the documentation pack in `~/wargame/Linux_Handoff/` (transferred from Mac alongside the projects). It contains:
- `1_TRANSFER.md` — what should be on disk (verify the transfer worked)
- `2_SETUP.md` — full Linux setup: Python venv, Qdrant via Docker, Ollama for the embedder, LLM config
- `3_RUN.md` — how to ingest the doctrine corpus + run the wargame + verify outputs
- `4_TROUBLESHOOT.md` — common Linux issues

Walk me through it step by step. Confirm at each milestone:
1. Files transferred + venv works
2. Qdrant running + collection created
3. Embedder serving (Ollama bge-m3 OR LM Studio Linux OR Hugging Face TEI)
4. LLM endpoint configured (OpenAI cloud or local Qwen)
5. Doctrine ingested into Qdrant
6. `python tests/test_full_run.py --max-phases 3` smoke test passes
7. `python tests/test_full_run.py --all` produces CSV + MD + GeoJSON
8. 11/11 quality checks pass

## Constraints / preferences

- **Linux distro**: I'm on Ubuntu/Debian-family. Use apt + native Docker (no colima — that's Mac-only).
- **Privacy**: keep traffic local where possible. Embedder MUST be local. LLM can be OpenAI cloud OR local Qwen — your call after we discuss.
- **No interactive GUIs** for the embedder if possible — prefer CLI tools (Ollama > LM Studio Linux for headless servers).
- **Quality bar**: outputs must match what we produced on Mac (11/11 quality checks). Random LLM hallucination retries are OK; structural failures are not.
- **Cost-conscious**: prefer local model swaps over cloud where reasonable.

## Background context (skim if relevant)

- The Mac-side `README.md`s have detailed architecture explanations
- We previously achieved 11/11 quality on a 17-phase Libya scenario at ~$2.40/run using GPT-4o cloud
- The smart-search system uses bge-m3 GGUF for embeddings (1024-dim), Qdrant for vector store, optional reranker (we degrade to RRF-only if reranker unavailable)
- The wargame is scenario-portable — different OOB DOCXs + scenario.json + doctrine corpus = different operation

Begin by reading `~/wargame/Linux_Handoff/README.md`, then proceed through the numbered docs. Confirm prerequisites first, then walk me through setup.

---
