# Memory Harness

## Summary

A memory harness is the task-specific system that decides how an agent stores, updates, retrieves, and reasons over memory. It includes the data model, read/write APIs, retrieval strategy, and maintenance rules.

## Why It Matters

The M* paper argues that no universal memory backend is optimal for all tasks. A chat agent may need semantic recall, a planning agent may need exact state tracking, and a medical QA agent may need structured field extraction. The right harness depends on the task.

## Key Details

- Memory is not only storage. It is also the operations around storage.
- Vector search is useful when semantic similarity is the access pattern.
- Tables or structured records are better when the task needs exact state or field lookup.
- Hybrid designs are often more realistic than a single memory store.
- A memory harness can evolve as failures reveal missing access patterns.

## Application To This Wiki

The wiki agent should use multiple memory surfaces:

- `wiki/` for durable public knowledge.
- `raw/sources/` for source metadata.
- `agent/memory/` for public project memory shared through GitHub.
- `.wiki-agent/` for local private memory and secrets.
- Future indexes for search acceleration, not as the source of truth.

## Related Pages

- [[wiki/sources/microsoft-m-memory-harness.md|Microsoft M*: Self-Evolving Memory Harness]]
- [[wiki/concepts/compilation-over-retrieval.md|Compilation Over Retrieval]]

## Sources

- [M*: Every Task Deserves Its Own Memory Harness](https://arxiv.org/abs/2604.11811)
- [WeChat article introducing M*](https://mp.weixin.qq.com/s/vqr9SsHeAOVNjKOolUAluQ)
