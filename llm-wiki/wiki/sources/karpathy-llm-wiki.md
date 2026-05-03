# Karpathy LLM Wiki Pattern

## Summary

Andrej Karpathy published an LLM wiki gist that frames the project as a persistent knowledge base maintained by an LLM. The important pattern is a separation between immutable raw material and compiled wiki pages, with explicit agent instructions for how to ingest, query, and improve the wiki.

## Why It Matters

Plain retrieval can answer from a pile of chunks, but it does not automatically improve the pile. A wiki creates a place where good answers become durable structure.

## Local Interpretation

- Preserve source material in `raw/`.
- Maintain a concise, linked `wiki/`.
- Start from the index, then drill down.
- Record changes in a log.
- Keep operating rules in `AGENTS.md` so future agent sessions inherit the discipline.

## Sources

- Andrej Karpathy gist: [LLM wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)
- Public demo/reference: [llmwiki.app](https://llmwiki.app/)

## Related Pages

- [[wiki/concepts/compilation-over-retrieval.md|Compilation Over Retrieval]]
- [[wiki/workflows/ingest.md|Ingest Workflow]]
