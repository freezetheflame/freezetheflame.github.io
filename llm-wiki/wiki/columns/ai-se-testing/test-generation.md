# Test Generation

## Summary

AI test generation is most useful when it is embedded in a verification loop. The agent should generate candidate tests, run them, repair failures, filter weak tests, and only keep tests that improve measurable behavior.

## Key Patterns

- **Generation-validation-repair**: ChatUniTest uses context selection, generation, validation, and repair as a workflow instead of treating the first completion as final.
- **Measurable improvement filters**: TestGen-LLM focuses on improving existing test suites and filters candidates to reduce hallucinated or non-useful tests.
- **Search plus LLM examples**: CODAMOSA uses traditional search-based software testing until coverage stalls, then asks an LLM for examples that can redirect search.
- **Execution feedback**: TestPilot shows that failed generated tests can be fed back into another prompt for repair.

## Design Implications

- Generated tests should be treated as hypotheses until they run.
- Coverage is useful but insufficient; a system also needs flakiness checks, mutation or fault signal, and regression safety.
- Test generation should preserve provenance: which source, issue, prompt, or failure led to the test.

## Related Pages

- [[wiki/columns/ai-se-testing/reading-list.md|Reading List]]
- [[wiki/columns/ai-se-testing/testing-frameworks.md|Testing Frameworks]]

## Sources

- [TestGen-LLM at Meta](https://arxiv.org/abs/2402.09171)
- [CODAMOSA](https://www.microsoft.com/en-us/research/publication/codamosa-escaping-coverage-plateaus-in-test-generation-with-pre-trained-large-language-models/)
- [ChatUniTest](https://arxiv.org/abs/2305.04764)
- [TestPilot](https://arxiv.org/abs/2302.06527)
