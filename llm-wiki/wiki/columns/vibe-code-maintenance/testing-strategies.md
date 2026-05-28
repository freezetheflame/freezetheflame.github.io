# Testing Strategies for Vibe-Coded Repos

## Strategy Selection Principle

Not all tests are equal for vibe-code maintenance. The goal is **maximum bug discovery per hour invested**. Prioritize tests that catch the failure modes vibe coding actually produces, not tests that confirm what already works.

## The Vibe-Code Testing Pyramid (Inverted)

Traditional testing pyramids put many unit tests at the bottom and few E2E tests at the top. For vibe-code maintenance, invert this:

```
        ▲ E2E smoke tests        ← catch "it doesn't work at all"
       ▲▲ Integration tests      ← catch "these two pieces don't fit"
      ▲▲▲ Property-based tests   ← catch "this invariant is violated"
     ▲▲▲▲ Error-path unit tests  ← catch "this edge case crashes"
    ▲▲▲▲▲ Happy-path unit tests  ← lowest ROI, skip initially
```

### Why This Order?

Happy-path tests confirm what the vibe demo already showed. Error-path and property-based tests surface what the demo hid. Start where the bugs are.

## Strategy Catalog

### 1. Smoke Tests (Always First)

**What**: A single test that exercises the primary user flow end-to-end.
**Cost**: 15-30 minutes
**ROI**: Catches deployment issues, config problems, and complete breakages immediately.

```python
# Example: smoke test for a web app
def test_smoke():
    response = client.get("/")
    assert response.status_code == 200
    response = client.post("/api/login", json={"user": "test", "pass": "test"})
    assert response.status_code == 200
```

**When to use**: First test you write. Always. If the smoke test fails, nothing else matters.

### 2. Issue-Driven Regression Tests

**What**: For each open issue, write a minimal test that reproduces the bug. Fix the code, keep the test.
**Cost**: 10-20 minutes per issue
**ROI**: Directly reduces issue count while building the regression suite.

This is the highest-ROI strategy for vibe-code maintenance. Instead of guessing what might break, test what already broke. Each fixed issue becomes a permanent guardrail.

**Workflow**:
1. Pick an open issue with clear reproduction steps
2. Write a test that fails (reproduces the bug)
3. Fix the code until the test passes
4. Commit test + fix together
5. Close the issue

### 3. Boundary/Edge-Case Unit Tests

**What**: Test the boundaries of each function: null, empty, max, min, invalid.
**Cost**: 5-15 minutes per function
**ROI**: Catches the #1 vibe-code failure mode: missing guards.

Focus on functions that:
- Accept user input directly
- Parse data from external sources
- Handle file I/O
- Interact with databases or APIs

Skip pure computation functions (they tend to be correct or obviously broken).

### 4. Property-Based Tests

**What**: Define invariants and let the test framework generate random inputs.
**Cost**: 15-30 minutes to set up, runs automatically
**ROI**: Finds edge cases you'd never think to test manually.

Particularly effective for vibe-coded repos because they catch the "unknown unknowns" — bugs from input combinations the developer never considered.

```python
# Example: property test for a JSON parser
@given(st.text())
def test_parse_never_crashes(s):
    try:
        result = parse_json(s)
    except JsonParseError:
        pass  # expected for invalid input
    # Assertion: parse_json should NEVER raise anything except JsonParseError
```

### 5. State Machine / Workflow Tests

**What**: Model multi-step processes as state machines and verify all transitions.
**Cost**: 30-60 minutes to model, moderate to maintain
**ROI**: Catches state inconsistency — vibe coding's blind spot.

Best for: checkout flows, onboarding wizards, multi-step forms, async job pipelines.

### 6. Snapshot / Golden Tests

**What**: Record the output of a function for known inputs and assert it never changes.
**Cost**: 5 minutes per snapshot
**ROI**: Catches silent output changes that break downstream consumers.

Use sparingly — snapshots that change for legitimate reasons create noise. Reserve for stable APIs and serialization formats.

## Strategy Selection Matrix

| Repo Characteristic | Start With |
|---------------------|-----------|
| Many open issues | Issue-driven regression tests |
| User-facing app | Smoke tests + boundary tests on inputs |
| API/library | Property-based tests on public API |
| Multi-step workflows | State machine tests |
| Data processing | Snapshot tests on output format |
| Unknown / exploring | Smoke test → scan issues → boundary tests |

## Anti-Patterns to Avoid

1. **100% coverage chasing**: The goal is bug reduction, not coverage metrics. 40% coverage on the right 40% beats 90% on the wrong 90%.
2. **Testing the framework**: Don't test that Express routes work or that React renders. Test *your* logic.
3. **Mock-heavy tests**: If your test mocks everything, it tests nothing. Prefer real integrations or fakes.
4. **Testing implementation details**: Test behavior, not internal state. Refactoring should not break tests.

## Measuring Success

Track these metrics before and after testing intervention:

- **Issue velocity**: new issues per week
- **Issue resolution rate**: closed issues per week
- **PR regression rate**: PRs that break existing tests
- **Time-to-fix**: hours from bug report to merged fix

A successful testing intervention should show:
- Decreasing issue velocity (fewer new bugs reported)
- Increasing resolution rate (faster fixes, thanks to regression safety)
- Near-zero PR regression rate (tests catch breakage before merge)

## Related Pages

- [[wiki/columns/vibe-code-maintenance/problem-statement.md|Problem Statement]]
- [[wiki/columns/vibe-code-maintenance/diagnostic-workflow.md|Diagnostic Workflow]]
- [[wiki/columns/vibe-code-maintenance/case-studies.md|Case Studies]]
- [[wiki/columns/ai-se-testing/test-generation.md|Test Generation]]
