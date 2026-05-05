# Wiki Index

Start here. This wiki is designed to be read and maintained by both humans and LLM agents.

## Current Focus

The wiki is currently growing around **AI-assisted automated software engineering testing**. The near-term goal is to understand how AI systems can generate tests, run tests, repair failures, maintain regression suites, and eventually become a practical testing agent for real projects.

The active research direction is now benchmark-first: use **RepoMemoryBench** to measure whether general software agents lack testing-specific project memory, then use **RepoMemoryTest** to study a memory design for that gap.

## Roadmap

### Phase 1: Research Radar

- Build the AI SE Testing column around primary sources, benchmarks, and field reports.
- Track the difference between unit-test generation, repository-level SWE agents, GUI/E2E testing, fuzzing, and CI regression loops.
- Keep short source notes in `raw/sources/` and durable synthesis in `wiki/columns/`.
- Build a source matrix for agent memory, SWE agents, testing history, and benchmark methodology.

### Phase 2: Testing Agent Design

- Design a local testing agent that can read a repository, find test commands, run focused tests, interpret failures, and propose new tests.
- Track project memory for recurring failures, flaky tests, reliable commands, and environment setup traps.
- Use [[wiki/concepts/memory-harness.md|Memory Harness]] thinking to keep source notes, test history, and private machine details in separate memory surfaces.
- Develop [[wiki/columns/ai-se-testing/research-proposals/repomemorytest.md|RepoMemoryBench -> RepoMemoryTest]] as the first serious paper direction.

### Phase 3: Prototype Experiments

- Start with small repositories and one language stack.
- Compare generated tests by compile success, pass rate, coverage delta, mutation signal, and regression usefulness.
- Record experiment logs as wiki pages instead of leaving results in chat history.

### Phase 4: Long-Running CI Loop

- Move from one-shot test generation toward CI-aware maintenance.
- Let the agent summarize CI failures, propose minimal tests, and preserve only validated improvements.
- Revisit benchmark design as public benchmarks age or stop measuring frontier capability.

## Core Pages

- [[wiki/overview.md|Overview]]
- [[wiki/log.md|Log]]
- [[wiki/sources/karpathy-llm-wiki.md|Karpathy LLM Wiki Pattern]]
- [[wiki/sources/microsoft-m-memory-harness.md|Microsoft M*: Self-Evolving Memory Harness]]
- [[wiki/concepts/compilation-over-retrieval.md|Compilation Over Retrieval]]
- [[wiki/concepts/memory-harness.md|Memory Harness]]

## Columns

- [[wiki/columns/ai-se-testing/index.md|AI SE Testing Column]]: the main hub for the current research direction.
- [[wiki/columns/ai-se-testing/reading-list.md|AI SE Testing Reading List]]: primary papers, benchmark pages, and project reports.
- [[wiki/columns/ai-se-testing/test-generation.md|Test Generation]]
- [[wiki/columns/ai-se-testing/swe-agent-evaluation.md|SWE Agent Evaluation]]
- [[wiki/columns/ai-se-testing/ci-and-regression.md|CI And Regression]]
- [[wiki/columns/ai-se-testing/testing-frameworks.md|Testing Frameworks]]
- [[wiki/columns/ai-se-testing/research-proposals/repomemorytest.md|RepoMemoryBench Research Proposal]]
- [[wiki/columns/ai-se-testing/research-progress.md|RepoMemoryBench Progress]]
- [[wiki/columns/ai-se-testing/experiment-design-repomemorytest.md|RepoMemoryTest Experiment Design]]
- [[wiki/columns/ai-se-testing/literature-collection-plan.md|RepoMemoryBench Literature Collection Plan]]
- [[wiki/columns/ai-se-testing/repomemorybench-source-matrix.md|RepoMemoryBench Source Matrix]]

## Open Research Tracks

- **Verified test generation**: generate tests, then filter by execution, coverage, mutation signal, and flakiness.
- **Agentic regression loop**: read failures, patch code or tests, rerun focused commands, then broaden validation.
- **Benchmark lifecycle**: track when a benchmark is high-signal, saturated, contaminated, or obsolete.
- **GUI/E2E testing agents**: translate user intent into browser or app interactions with inspectable assertions.
- **Fuzzing and security testing**: use LLMs for seed generation, fuzz driver creation, and exploit triage while preserving reproducibility.
- **Project memory for testing**: benchmark whether current agents miss commands, failure modes, flaky tests, and setup notes across repeated repository work.

## Workflows

- [[wiki/workflows/ingest.md|Ingest Workflow]]
- [[wiki/workflows/query.md|Query Workflow]]
- [[wiki/workflows/lint.md|Lint Workflow]]

## Expansion Backlog

- Expand the RepoMemoryBench source matrix into a full related-work table.
- Add `trend-map.md` for the AI SE Testing column if it remains distinct from the source matrix.
- Add pages for verified test generation, agentic regression loops, GUI/E2E testing agents, fuzzing/security testing, and project memory for testing.
- Add a local model/runtime page when the wiki agent chat layer is implemented.
- Add experiment logs once AI testing prototypes begin.
- Add a glossary once more than ten recurring terms appear.
