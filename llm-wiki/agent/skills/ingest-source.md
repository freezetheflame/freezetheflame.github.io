# Skill: Ingest Source

## Purpose

Turn one external source into durable wiki knowledge.

## Steps

1. Capture source metadata in `raw/sources/`.
2. Read related wiki pages before writing synthesis.
3. Decide whether the source creates a new concept page or updates an existing page.
4. Write summary, implications, related pages, and source links in `wiki/`.
5. Update `wiki/index.md`, `app/wiki-data.js`, `wiki/log.md`, and `agent/memory/source-ledger.md`.
6. Keep copyrighted source text out of the repository unless it is licensed or user-owned.
