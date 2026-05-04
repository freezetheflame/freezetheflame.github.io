# AI SE Testing Column

## Summary

This column tracks AI-assisted automated software engineering testing. The focus is not "LLM writes code" in general, but how AI systems generate, improve, validate, and maintain tests across real codebases.

## Why This Column Exists

Auto SE testing sits at the intersection of testing frameworks, agent tooling, benchmarks, CI, and long-term code maintenance. It needs its own reading lane because single-shot coding benchmarks do not fully capture the work of keeping a repository healthy over time.

## Reading Path

- [[wiki/columns/ai-se-testing/reading-list.md|Reading List]]
- [[wiki/columns/ai-se-testing/test-generation.md|Test Generation]]
- [[wiki/columns/ai-se-testing/swe-agent-evaluation.md|SWE Agent Evaluation]]
- [[wiki/columns/ai-se-testing/ci-and-regression.md|CI And Regression]]
- [[wiki/columns/ai-se-testing/testing-frameworks.md|Testing Frameworks]]

## Working Thesis

Useful AI testing systems should combine generation with verification. The strongest pattern across the sources is not "ask an LLM for tests"; it is "use an LLM inside a loop that can compile, run, filter, repair, and preserve only measurable improvements."

## Related Pages

- [[wiki/concepts/memory-harness.md|Memory Harness]]
- [[wiki/concepts/compilation-over-retrieval.md|Compilation Over Retrieval]]
