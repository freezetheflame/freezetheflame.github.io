# RepoMemoryBench Source Matrix

## Summary

This matrix tracks sources for RepoMemoryBench. It is not the final literature review. It is the working table that maps each source to the role it can play in the argument.

## Why It Matters

RepoMemoryBench needs to prove that testing-specific memory is a real benchmark requirement, not a renamed version of generic agent memory. Each source should therefore answer at least one of these questions:

- What memory mechanism already exists?
- What testing or CI signal already matters?
- What current benchmark does or does not measure?
- What metric should RepoMemoryBench inherit or avoid?

## Matrix

| Lane | Source | Current Role | Read Status | RepoMemoryBench Question |
| --- | --- | --- | --- | --- |
| SWE benchmark | SWE-bench: https://arxiv.org/abs/2310.06770 | Establishes repository-level issue resolution as an agent evaluation setting. | Seeded | How much of repository success depends on testing and validation? |
| SWE benchmark | SWE-agent: https://arxiv.org/abs/2405.15793 | Gives an agent baseline and action-loop reference for software engineering tasks. | Seeded | Can a widely cited SWE agent preserve project testing knowledge across repeated tasks? |
| SWE agent | OpenHands: https://arxiv.org/abs/2407.16741 | Open platform for generalist software agents and a candidate benchmark subject. | Seeded | Can an open, scriptable agent expose enough logs for memory-failure analysis? |
| SWE benchmark | SWE-Bench-CL: https://arxiv.org/abs/2507.00014 | Continual-learning framing for SWE agents. | Seeded | Does continual repository work expose memory failures that one-shot benchmarks hide? |
| SWE benchmark | SWE-CI: https://arxiv.org/abs/2603.03823 | CI-oriented benchmark for software agents. | Seeded | Which CI failures require historical test and environment knowledge? |
| SWE benchmark | SetupBench: https://arxiv.org/abs/2507.09063 | Environment bootstrapping benchmark for SWE agents. | Seeded | Which setup traps should RepoMemoryBench model as project memory? |
| Benchmark lifecycle | SWE-bench Verified: https://openai.com/index/introducing-swe-bench-verified/ | Shows the value of human-verified benchmark subsets. | Seeded | Should RepoMemoryBench include human validation of task labels and expected behaviors? |
| Benchmark lifecycle | OpenAI SWE-bench Verified retirement note: https://openai.com/index/why-we-no-longer-evaluate-swe-bench-verified/ | Shows that benchmark signal can age or saturate. | Seeded | How should the benchmark remain useful after frontier agents improve? |
| Agent memory | Reflexion: https://arxiv.org/abs/2303.11366 | Classic verbal feedback memory pattern. | Seeded | Is reflective memory enough for testing, or does it lack execution-grounded trust? |
| Agent memory | Voyager: https://arxiv.org/abs/2305.16291 | Skill-library pattern for long-lived agents. | Seeded | Can testing commands and failure handling be modeled as skills? |
| Agent memory | MemGPT: https://arxiv.org/abs/2310.08560 | Memory-tier management pattern for LLM agents. | Seeded | What should live in short context versus durable project memory? |
| Agent memory | How Memory Management Impacts LLM Agents: https://arxiv.org/abs/2505.16067 | Empirical anchor for memory-management effects. | Seeded | Which memory design dimensions should be ablated? |
| AI test generation | TestGen-LLM: https://arxiv.org/abs/2402.09171 | Execution-filtered generated tests in industrial setting. | Seeded | What validation filters should count as useful generated tests? |
| AI test generation | CODAMOSA: https://www.microsoft.com/en-us/research/publication/codamosa-escaping-coverage-plateaus-in-test-generation-with-pre-trained-large-language-models/ | Combines search-based testing and LLM generation. | Seeded | How should coverage-guided signals interact with agent memory? |
| AI test evaluation | TestGenEval: https://testgeneval.github.io/index.html | Benchmark for test generation evaluation. | Seeded | Which generated-test metrics can be reused or contrasted? |
| Testing history | Regression testing survey, Yoo and Harman: https://doi.org/10.1002/stvr.430 | Traditional map of test selection, minimization, and prioritization. | To collect | Which historical test-selection signals should become memory fields? |
| Testing reliability | Flaky test detection and management surveys | Testing reliability background. | To collect | How should memory avoid over-trusting flaky failures? |
| CI diagnosis | CI failure diagnosis and repair papers | Repository maintenance background. | To collect | Which CI failure classes are memory-dependent? |
| Fault localization | Fault localization surveys and benchmarks | Diagnosis background. | To collect | Can memory improve where the agent looks after a failed test? |
| Mutation testing | Mutation testing surveys and tools | Generated-test quality signal. | To collect | Should mutation signal be part of benchmark scoring? |

## Initial Synthesis

The current source shape suggests a clear gap. Agent-memory work explains how agents can retain information across tasks, while testing and CI research explains which historical signals are valuable. RepoMemoryBench should connect them by evaluating whether agents can preserve and apply testing-specific memory under executable evidence.

## Next Fill-In Fields

For each source, add:

- one-sentence claim,
- method or benchmark setup,
- useful metric,
- limitation,
- implication for RepoMemoryBench,
- source-backed quote or paraphrase with page/section if available.

## Related Pages

- [[wiki/columns/ai-se-testing/literature-collection-plan.md|RepoMemoryBench Literature Collection Plan]]
- [[wiki/columns/ai-se-testing/testing-memory-related-work-map.md|Testing Memory Related Work Map]]
- [[wiki/columns/ai-se-testing/research-proposals/repomemorytest.md|RepoMemoryBench -> RepoMemoryTest]]

## Sources

- `raw/sources/repomemorybench-literature-seeds.md`
