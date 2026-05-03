# Microsoft M*: Self-Evolving Memory Harness

## Summary

The WeChat article "微软M*：自进化的记忆Harness" introduces the paper `M*: Every Task Deserves Its Own Memory Harness`. Its core claim is that agent memory should not be a one-size-fits-all vector store. Different tasks need different storage formats, retrieval logic, and update rules.

## Why It Matters

This directly informs the LLM Wiki design. The wiki agent should not treat all memory as the same thing. Source metadata, project decisions, user preferences, private notes, and retrieval indexes have different jobs and should live in different structures.

## Key Details

- M* expresses memory management as executable Python code rather than a fixed backend.
- The system iteratively tests, reflects on failures, and rewrites memory code.
- Reported evolved memory designs differ by task: structured SQL-like state for household planning, hybrid vector and relational structures for long conversation, and structured field extraction for medical question answering.
- The broader lesson is that memory design should follow the task's access pattern.

## Implications For This Wiki

- Use `agent/memory/` for public project memory that should sync across machines.
- Use `.wiki-agent/` for local private overlay memory and secrets.
- Keep source metadata separate from synthesized wiki pages.
- Add retrieval later based on actual usage: simple Markdown search first, SQLite full-text or embeddings only when needed.

## Related Pages

- [[wiki/concepts/memory-harness.md|Memory Harness]]
- [[wiki/concepts/compilation-over-retrieval.md|Compilation Over Retrieval]]
- [[wiki/workflows/ingest.md|Ingest Workflow]]

## Sources

- WeChat article: [微软M*：自进化的记忆Harness](https://mp.weixin.qq.com/s/vqr9SsHeAOVNjKOolUAluQ)
- Paper: [M*: Every Task Deserves Its Own Memory Harness](https://arxiv.org/abs/2604.11811)
