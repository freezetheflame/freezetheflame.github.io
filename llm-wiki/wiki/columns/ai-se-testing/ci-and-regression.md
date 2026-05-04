# CI And Regression

## Summary

CI-centered AI testing is about long-term repository health. It asks whether an agent can keep a codebase correct across repeated changes, not just fix one issue once.

## Key Patterns

- **Continuous integration loop**: SWE-CI frames maintainability as functional correctness over time.
- **Regression safety**: Every generated patch should run both targeted tests and broad regression checks.
- **Failure memory**: Useful agents should remember recurring failures, flaky tests, environment setup traps, and test commands that matter.
- **Long horizon evaluation**: A codebase evolving over many commits exposes whether an agent can sustain quality.

## Design Implications

- The future wiki agent should maintain a source ledger for testing failures and fixes.
- CI results should be summarized into durable notes when they teach something reusable.
- Generated tests should include a reason, a source trigger, and a validation command.

## Related Pages

- [[wiki/columns/ai-se-testing/swe-agent-evaluation.md|SWE Agent Evaluation]]
- [[wiki/concepts/memory-harness.md|Memory Harness]]

## Sources

- [SWE-CI](https://arxiv.org/abs/2603.03823)
- [SWE-bench Verified](https://openai.com/index/introducing-swe-bench-verified/)
