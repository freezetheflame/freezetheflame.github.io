# AI SE Testing Column

## Summary

This column tracks AI-assisted automated software engineering testing. The focus is not "LLM writes code" in general, but how AI systems generate, improve, validate, and maintain tests across real codebases.

## Why This Column Exists

Auto SE testing sits at the intersection of testing frameworks, agent tooling, benchmarks, CI, and long-term code maintenance. It needs its own reading lane because single-shot coding benchmarks do not fully capture the work of keeping a repository healthy over time.

## Current Research Direction

The first paper direction is **RepoMemoryBench**: a benchmark and measurement study for whether widely used software agents fail on testing tasks because they do not preserve testing-specific project memory. The follow-up method direction is **RepoMemoryTest**: a structured memory harness for agentic regression testing.

This order matters. A benchmark-first paper can establish the gap before a method paper claims that a new memory design is necessary.

## Reading Path

- [[wiki/columns/ai-se-testing/reading-list.md|Reading List]]
- [[wiki/columns/ai-se-testing/test-generation.md|Test Generation]]
- [[wiki/columns/ai-se-testing/swe-agent-evaluation.md|SWE Agent Evaluation]]
- [[wiki/columns/ai-se-testing/ci-and-regression.md|CI And Regression]]
- [[wiki/columns/ai-se-testing/testing-frameworks.md|Testing Frameworks]]

## Research Seeds

- [[wiki/columns/ai-se-testing/research-proposals/repomemorytest.md|RepoMemoryBench -> RepoMemoryTest: Project-Memory-Guided Agentic Regression Testing]]
- [[wiki/columns/ai-se-testing/research-progress.md|RepoMemoryBench Research Progress]]
- [[wiki/columns/ai-se-testing/experiment-design-repomemorytest.md|RepoMemoryTest Experiment Design]]
- [[wiki/columns/ai-se-testing/testing-memory-related-work-map.md|Testing Memory Related Work Map]]
- [[wiki/columns/ai-se-testing/literature-collection-plan.md|RepoMemoryBench Literature Collection Plan]]
- [[wiki/columns/ai-se-testing/repomemorybench-source-matrix.md|RepoMemoryBench Source Matrix]]

## Working Thesis

Useful AI testing systems should combine generation with verification. The strongest pattern across the sources is not "ask an LLM for tests"; it is "use an LLM inside a loop that can compile, run, filter, repair, and preserve only measurable improvements."

For the current research track, the sharper thesis is: **general agent memory is not enough for testing**. Testing memory must be execution-grounded, reliability-aware, and regression-oriented.

## Related Pages

- [[wiki/concepts/memory-harness.md|Memory Harness]]
- [[wiki/concepts/compilation-over-retrieval.md|Compilation Over Retrieval]]
