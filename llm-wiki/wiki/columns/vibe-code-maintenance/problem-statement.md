# Problem Statement: Vibe Code Maintenance Debt

## What Is Vibe Coding?

Vibe coding is the practice of building software primarily through natural-language prompts to AI coding tools (Cursor, Claude Code, Codex CLI, Cline, etc.), with minimal manual intervention. The developer describes what they want; the AI writes it. Rinse and repeat.

The output is often impressive — working features materialize in minutes. But the process systematically omits what traditional software engineering considers essential.

## The Specification Gap

When a human writes code, they carry implicit knowledge: what happens when the input is empty, what the error messages should say, which states are valid and which aren't. The AI carries none of this unless explicitly told.

The result is **specification debt**: the code implements a thin slice of happy-path behavior with no explicit definition of correctness beyond "it ran once without crashing."

This is different from traditional technical debt:
- **Technical debt**: the code is messy but the *intent* is clear
- **Specification debt**: the code is clean but the *intent* is missing

## Failure Modes

Vibe-coded repos exhibit predictable failure patterns:

### 1. Missing Null/Empty Guards
The AI writes the main logic path but skips guards. Null inputs, empty arrays, undefined values — all crash at runtime. Example: an API endpoint that works with valid JSON but throws a 500 on `{}`.

### 2. Unhandled Edge Cases
The prompt said "handle file uploads" but didn't say what happens with 0-byte files, files with non-ASCII names, or concurrent uploads. Each edge case becomes a GitHub issue.

### 3. Broken Error Paths
AI-generated code often has try/catch blocks that log and swallow, or worse, no error handling at all. The error path is invisible in the happy-path demo but becomes the primary user experience in production.

### 4. State Inconsistency
Multi-step workflows (checkout flows, onboarding sequences, multi-page forms) accumulate state bugs. The AI handles each step in isolation; no one verified that the sequence works end-to-end.

### 5. Silent Regression
New features break old features because there's no regression suite. The AI doesn't know what it might break. Each PR fixes one thing and breaks two others.

## The Issue Explosion Pattern

A typical vibe-coded repo follows this trajectory:

```
Week 1-2: Rapid feature development. 0-5 issues.
Week 3-4: Early adopters find edge cases. 10-30 issues.
Week 5-8: Issue count outpaces fix rate. 50-100+ issues.
Week 8+: Maintainer burnout. PRs slow. Abandonment risk.
```

The core problem is not that the code is bad — it's that there's no safety net. Every change is a gamble.

## Why Traditional Testing Is the Answer

Tests are executable specifications. They define expected behavior explicitly and verifiably. For a vibe-coded repo, tests serve three roles simultaneously:

1. **Bug detector**: catches regressions before users do
2. **Specification document**: the test suite *is* the spec for what the code should do
3. **AI guardrail**: constrains future vibe-coding sessions to stay within known-good behavior

The key insight: you don't need 100% coverage to get 80% of the benefit. A small, well-chosen test suite targeting the repo's specific failure modes can dramatically reduce issue velocity.

## What This Column Investigates

- Which testing strategies give the highest ROI for vibe-coded repos?
- Can we develop a repeatable diagnostic workflow?
- What does a "vibe-code health score" look like?
- How do we pick the right repos to study?

## Related Pages

- [[wiki/columns/vibe-code-maintenance/testing-strategies.md|Testing Strategies]]
- [[wiki/columns/vibe-code-maintenance/diagnostic-workflow.md|Diagnostic Workflow]]
- [[wiki/columns/vibe-code-maintenance/case-studies.md|Case Studies]]
