# AI SE Testing Reading List

## Summary

This is the first curated source set for AI-assisted automated software engineering testing. The list favors papers, benchmark sites, and primary project pages over commentary.

## Core Benchmarks And Agent Evaluation

- [SWE-bench](https://arxiv.org/abs/2310.06770): Real GitHub issue benchmark that evaluates whether an agent can patch a repository and pass hidden tests.
- [SWE-bench Verified](https://openai.com/index/introducing-swe-bench-verified/): Human-validated subset created to address underspecified issues, problematic tests, and unreliable environments.
- [Why SWE-bench Verified no longer measures frontier coding capabilities](https://openai.com/index/why-we-no-longer-evaluate-swe-bench-verified/): Important benchmark lifecycle note; frontier evaluations can age out once data becomes public, saturated, or too easy for current systems.
- [SWE-agent](https://arxiv.org/abs/2405.15793): Shows that agent-computer interface design affects how well language model agents edit repositories and run tests.
- [SWE-CI](https://arxiv.org/abs/2603.03823): Moves evaluation toward continuous integration and long-term maintainability rather than one-shot repair.

## Test Generation And Improvement

- [TestGen-LLM at Meta](https://arxiv.org/abs/2402.09171): Industrial report on using LLMs to improve existing human-written tests with filters that require measurable improvement.
- [CODAMOSA](https://www.microsoft.com/en-us/research/publication/codamosa-escaping-coverage-plateaus-in-test-generation-with-pre-trained-large-language-models/): Combines search-based software testing with LLM-generated examples when coverage stalls.
- [ChatUniTest](https://arxiv.org/abs/2305.04764): LLM-based unit test generation with adaptive focal context and generation-validation-repair loops.
- [TestPilot](https://arxiv.org/abs/2302.06527): Empirical evaluation of LLM-generated JavaScript unit tests over npm packages.
- [TestGenEval](https://testgeneval.github.io/index.html): Real-world test generation benchmark for evaluating whether generated tests are useful beyond toy tasks.

## Initial Sorting

- Start with SWE-bench and SWE-agent to understand the agent evaluation frame.
- Read TestGen-LLM and CODAMOSA to understand practical generated-test filtering.
- Read SWE-CI when designing long-running CI or regression workflows.

## Related Pages

- [[wiki/columns/ai-se-testing/test-generation.md|Test Generation]]
- [[wiki/columns/ai-se-testing/swe-agent-evaluation.md|SWE Agent Evaluation]]
- [[wiki/columns/ai-se-testing/ci-and-regression.md|CI And Regression]]
