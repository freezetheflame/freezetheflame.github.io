# Effective Delegation

## Summary

Delegating work to an AI agent is not the same as delegating to a human colleague. Agents lack shared context, implicit understanding, and the ability to ask clarifying questions mid-task (in automated/cron contexts). Effective delegation means describing the work so completely that the agent never needs to guess.

## Why It Matters

Poor delegation is the most common failure mode in agent workflows. When an agent misunderstands a task, it wastes time, produces wrong output, and often compounds errors by building on its own mistakes. The cost of a bad delegation is much higher than the cost of writing a good one.

## Core Principles

### 1. Scope Tightly

Agents perform best on tasks with clear boundaries. Instead of "add tests to the project," say "add unit tests for the three public functions in `src/auth.py`, covering happy paths, edge cases for empty input, and one error path per function."

- Good scope: one file, one feature, one well-defined outcome
- Risky scope: "improve the codebase" or "fix the bugs"
- Worst scope: open-ended research with no deliverable

### 2. Describe the Deliverable, Not the Process

Tell the agent *what success looks like*, not *every step to get there*. Agents are better at pathfinding than humans expect. Over-specifying the process often constrains them into worse solutions.

Bad: "Open file A, find function B, add a try-catch at line 42, then run pytest..."
Good: "Add error handling to `src/auth.py` so that network failures during token validation return a clear error message instead of crashing. The existing test suite should still pass. Add one new test for the network failure case."

### 3. Specify Constraints Up Front

Every delegation should include explicit constraints. Without them, agents optimize for completeness at the expense of correctness, simplicity, or safety.

Essential constraints to specify:
- **Scope boundary**: "Only modify files in `src/api/`. Do not touch `src/db/`."
- **Style / convention**: "Follow existing patterns in the file — no refactoring unless asked."
- **Output format**: "Return a single unified diff, not multiple patches."
- **Verification**: "Run `npm test` before declaring done. If tests fail, fix them before reporting."
- **Safety**: "Do not push to main. Create a branch and open a PR."

### 4. Prefer Concrete Examples

Agents understand examples better than abstract rules. When describing expected behavior, include a concrete input-output pair.

Bad: "Handle edge cases in the date parser."
Good: "The date parser should accept '2026-01-15' and return a Date object. For invalid input like 'not-a-date' or '', return `null` without throwing."

### 5. Use Incremental Delegation

For complex tasks, don't delegate everything at once. Break the work into phases and delegate one phase at a time:

1. Phase 1: "Read `src/auth.py` and `tests/test_auth.py`. Summarize the current test coverage in 3-5 bullet points."
2. Review the summary, decide what's missing.
3. Phase 2: "Add tests for the password reset flow. Cover: valid reset, expired token, invalid email."

Each phase gives you a checkpoint to correct course before the agent builds on wrong assumptions.

## Anti-Patterns

### The "Just Do It" Delegation

"Add authentication to the project." This fails because:
- No scope: which auth mechanism? Which endpoints? Which files?
- No constraints: what dependencies are allowed? What patterns to follow?
- No verification: how does the agent know it succeeded?

### The "Kitchen Sink" Delegation

"Refactor the entire backend, add tests, update documentation, and deploy." Multiple unrelated tasks in one delegation confuse the agent and make it hard to verify any single outcome. Delegate one concern at a time.

### The "Trust Fall" Delegation

Delegating without verification steps, then discovering days later that the output was wrong. Always include a verification step in the delegation itself: "After generating the SQL migration, run it against a test database and report whether it succeeded."

## Task Size Heuristic

| Task Size | Description | Example | Risk |
|-----------|-------------|---------|------|
| Small | ~1 file, ~1 function, clear spec | "Add docstring to `parse_config()`" | Low |
| Medium | ~3-5 files, 1 feature, defined scope | "Add password reset endpoint with tests" | Medium |
| Large | 5+ files, cross-cutting concern | "Add rate limiting to all API endpoints" | High — use incremental delegation |
| X-Large | Architecture-level, many unknowns | "Design and implement a caching layer" | Very high — design first with human, then delegate implementation |

## Verification Checklist

Before submitting a delegation, verify:
- [ ] The deliverable is clearly defined (one concrete outcome)
- [ ] Constraints are explicit (scope, style, verification, safety)
- [ ] An example of expected behavior is included
- [ ] For complex tasks, the work is broken into phases
- [ ] A verification step is part of the delegation itself

## Sources

- Direct experience with Hermes Agent, Claude Code, Codex CLI, and OpenCode
- Patterns observed across the AI SE Testing column's literature on agent evaluation

## Related Pages

- [[wiki/columns/agent-work-patterns/context-engineering.md|Context Engineering]]
- [[wiki/columns/agent-work-patterns/feedback-loops.md|Feedback Loops]]
- [[wiki/columns/agent-work-patterns/index.md|Agent Work Patterns Column]]
