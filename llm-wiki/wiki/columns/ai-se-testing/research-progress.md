# RepoMemoryBench Research Progress

## Current Stage

Stage: **direction finalized / literature collection started**.

The working agenda is [[wiki/columns/ai-se-testing/research-proposals/repomemorytest.md|RepoMemoryBench -> RepoMemoryTest: Project-Memory-Guided Agentic Regression Testing]].

## What We Have

- A wiki column for AI-assisted automated software engineering testing.
- A first reading list covering SWE-bench, SWE-agent, SWE-bench Verified, TestGen-LLM, CODAMOSA, ChatUniTest, TestPilot, TestGenEval, and SWE-CI.
- A working thesis: useful AI testing systems should combine generation with verification and preserve validated project memory.
- A local wiki agent memory model: repo memory plus local private overlay.
- A two-stage framing: first measure the gap with RepoMemoryBench, then propose the method with RepoMemoryTest.
- A sharper thesis: memory for testing must be execution-grounded, reliability-aware, and regression-oriented.
- A finalized first paper direction: evaluate whether current general software agents fail on testing tasks because they lack testing-specific project memory.
- A literature collection plan and source matrix for turning the idea into a real related-work base.

## Immediate Next Work

- Fill [[wiki/columns/ai-se-testing/repomemorybench-source-matrix.md|RepoMemoryBench Source Matrix]] with notes, claims, limitations, and benchmark implications.
- Expand related work around memory-augmented agents, CI-oriented SWE agents, test generation quality filters, long-running repository maintenance, and regression testing history.
- Convert the related-work map into a structured table separating general agent memory from testing-specific history and CI knowledge.
- Define a minimal pilot dataset: a few small repositories with stable test commands and historical failures.
- Design memory schemas for commands, failure signatures, flaky tests, environment traps, module risk, and generated-test provenance.
- Build a first prototype loop that only selects and runs tests before attempting test generation.

## Open Risks

- The contribution may look too systems-oriented unless the evaluation is crisp.
- The method may be dismissed as a generic agent-memory variant unless the testing-specific memory requirements are made explicit.
- Benchmarks may be noisy if repositories are hard to set up.
- Generated test quality needs stronger signals than coverage alone.
- Long-running evaluation can become expensive in model calls and CI time.

## Next Milestone

Produce a two-page research note with:

- precise research questions,
- related-work table,
- agent selection protocol,
- pilot benchmark design,
- first memory schema,
- minimal prototype plan.

The immediate sub-milestone is **Source Matrix v1**: at least 20 primary or near-primary sources, each mapped to one role in the argument.
