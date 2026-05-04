# SWE Agent Evaluation

## Summary

SWE agent evaluation asks whether an agent can understand a real repository, edit files, run tests, and produce a patch that resolves a software issue without breaking unrelated behavior.

## Key Patterns

- **Repository-level tasks**: SWE-bench uses real GitHub issues and pull requests, which forces agents to navigate code rather than solve isolated snippets.
- **Hidden tests**: Evaluation depends on failing tests that should pass after the fix and passing tests that should remain passing.
- **Agent-computer interface**: SWE-agent argues that the interface given to the agent matters: editing, searching, navigating, and test-running tools shape performance.
- **Benchmark lifecycle**: SWE-bench Verified shows that benchmarks need human quality control; later OpenAI notes show that even verified benchmarks can stop measuring frontier capabilities.

## Design Implications

- A serious auto SE testing workflow should log every test command, failure, patch, and validation result.
- The agent should not optimize only for benchmark pass rate; it should preserve maintainability and explain why each test matters.
- Evaluation data should be refreshed or versioned because public benchmarks age.

## Related Pages

- [[wiki/columns/ai-se-testing/reading-list.md|Reading List]]
- [[wiki/columns/ai-se-testing/ci-and-regression.md|CI And Regression]]

## Sources

- [SWE-bench](https://arxiv.org/abs/2310.06770)
- [SWE-agent](https://arxiv.org/abs/2405.15793)
- [SWE-bench Verified](https://openai.com/index/introducing-swe-bench-verified/)
- [Why SWE-bench Verified no longer measures frontier coding capabilities](https://openai.com/index/why-we-no-longer-evaluate-swe-bench-verified/)
