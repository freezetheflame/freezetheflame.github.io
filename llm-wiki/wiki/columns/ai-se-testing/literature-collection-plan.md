# RepoMemoryBench Literature Collection Plan

## Summary

This page defines how to collect sources for RepoMemoryBench, the benchmark-first study of whether general software agents fail on testing tasks because they lack testing-specific project memory.

## Why It Matters

The idea will be weak if it only says "agents need memory." The literature review must show a sharper gap:

- general agent memory exists but is not designed around executable testing evidence,
- software testing already uses history and reliability signals but not as an LLM-agent memory interface,
- current SWE benchmarks measure repository work but do not isolate testing-specific memory requirements.

## Collection Goal

Build a source base that can support four paper sections:

- benchmark motivation,
- agent and memory background,
- testing-specific historical knowledge,
- evaluation protocol and threats to validity.

## Source Lanes

### Lane A: General Agent Memory

Collect sources on long-term memory, episodic memory, skill memory, reflection, memory management, RAG memory, and task-specific memory harnesses.

Key question: what does generic memory store, how is it updated, and how is it trusted?

### Lane B: SWE Agents And Benchmarks

Collect sources on repository-level agents and benchmarks such as SWE-bench, SWE-agent, OpenHands, SWE-Bench-CL, SWE-CI, and benchmark lifecycle notes.

Key question: do existing agent benchmarks reveal memory-dependent testing failures, or do they hide them inside broader task success?

### Lane C: Testing History And CI Knowledge

Collect sources on regression test selection, test prioritization, flaky tests, CI failure diagnosis, fault localization, coverage, mutation testing, and test history mining.

Key question: what testing knowledge is already known to be useful over time?

### Lane D: AI Test Generation And Validation

Collect sources on LLM-generated tests, execution filters, coverage filters, mutation signal, generated-test repair, and benchmark quality.

Key question: which signals should RepoMemoryBench measure beyond "agent finished the task"?

### Lane E: Benchmark Methodology

Collect sources on contamination, benchmark saturation, reproducibility, task construction, human verification, and cost-aware evaluation.

Key question: how should the benchmark avoid being noisy, saturated, or too expensive to reproduce?

## Inclusion Criteria

Prefer sources that satisfy at least one condition:

- primary paper, official benchmark page, official project docs, or official project repository,
- directly evaluates agents, testing, CI, or memory,
- provides measurable tasks or metrics,
- exposes a limitation that RepoMemoryBench can turn into a benchmark requirement.

## Exclusion Criteria

Deprioritize sources that are:

- only blog commentary without a primary source,
- only prompt collections or tool lists,
- only product marketing without reproducible details,
- unrelated to repository-level testing.

## Output Artifacts

- `raw/sources/repomemorybench-literature-seeds.md`: source metadata and links.
- [[wiki/columns/ai-se-testing/repomemorybench-source-matrix.md|RepoMemoryBench Source Matrix]]: durable mapping from source to argument role.
- [[wiki/columns/ai-se-testing/testing-memory-related-work-map.md|Testing Memory Related Work Map]]: synthesis of the gap.
- Later: a two-page research note with RQs, agent selection protocol, pilot benchmark design, and threats to validity.

## First Pass Reading Order

1. SWE-Bench-CL and SWE-CI for benchmark motivation.
2. How Memory Management Impacts LLM Agents for empirical memory framing.
3. SWE-bench and SWE-agent for repository-level agent baseline context.
4. Reflexion, Voyager, and MemGPT for classic memory patterns.
5. TestGen-LLM, CODAMOSA, and TestGenEval for generated-test quality signals.
6. Regression testing and flaky-test surveys for testing-history grounding.

## Related Pages

- [[wiki/columns/ai-se-testing/research-proposals/repomemorytest.md|RepoMemoryBench -> RepoMemoryTest]]
- [[wiki/columns/ai-se-testing/research-progress.md|RepoMemoryBench Research Progress]]
- [[wiki/columns/ai-se-testing/testing-memory-related-work-map.md|Testing Memory Related Work Map]]
- [[wiki/columns/ai-se-testing/repomemorybench-source-matrix.md|RepoMemoryBench Source Matrix]]

## Sources

- `raw/sources/repomemorybench-literature-seeds.md`
