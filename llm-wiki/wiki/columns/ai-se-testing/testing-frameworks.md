# Testing Frameworks

## Summary

Testing frameworks are the execution substrate for AI testing agents. The practical question is not only which framework is popular, but which framework gives an agent reliable, inspectable feedback.

## Framework Criteria For Agents

- **Fast focused execution**: The agent needs to run one test, one file, or one package without paying full-suite cost every time.
- **Clear failure output**: Assertions, stack traces, snapshots, and diffs should be easy to parse.
- **Stable commands**: The project should document canonical commands so the agent does not guess.
- **Fixture visibility**: Test setup should be readable and deterministic.
- **Regression layering**: The framework should support targeted tests plus broader smoke or integration suites.

## Column Backlog

- Compare JavaScript/TypeScript stacks: Vitest, Jest, Playwright, Cypress.
- Compare Python stacks: pytest, unittest, Hypothesis.
- Study mutation testing and property-based testing as signals for generated test quality.
- Build a local "AI test generation harness" page once this wiki has enough implementation experiments.

## Related Pages

- [[wiki/columns/ai-se-testing/test-generation.md|Test Generation]]
- [[wiki/columns/ai-se-testing/ci-and-regression.md|CI And Regression]]
