# Vibe Code Maintenance Column

## Summary

This column explores a practical inversion of the AI-testing relationship: instead of using AI to *generate* tests, use testing discipline to *maintain and heal* repositories built primarily through vibe coding — AI-driven, prompt-to-code workflows that produce functional but under-tested, bug-prone codebases.

## Why This Column Exists

Vibe coding has exploded. Tools like Cursor, Claude Code, Codex CLI, and Cline produce entire features from natural language. The result is a new class of repository: functionally impressive, but with thin test coverage, unclear invariants, and mountains of issues and PRs from users discovering edge cases the AI never considered.

These repos are not "bad code" in the traditional sense. They are *under-specified* code. The AI wrote what was asked, but no one asked for resilience, error handling, or edge-case coverage. The code works on the happy path and crumbles everywhere else.

Traditional software testing — unit tests, integration tests, property-based tests, fuzz tests, regression suites — is exactly the toolset for this problem. Tests are executable specifications. Adding them to a vibe-coded repo is like adding a skeleton to a jellyfish: structure emerges where there was none.

## Relationship to Other Columns

- **[[wiki/columns/ai-se-testing/index.md|AI SE Testing]]** asks "can AI write and maintain tests?" — this column asks "can tests fix AI-written code?"
- **[[wiki/columns/agent-work-patterns/index.md|Agent Work Patterns]]** covers how to work *with* agents — this column covers what happens *after* the agent is done

The three columns form a complete picture: work with agents → test what they produce → study whether agents can test themselves.

## Working Thesis

> Vibe-coded repositories suffer from *specification debt*, not technical debt. The code is often clean and idiomatic; what's missing is the explicit definition of expected behavior. Traditional testing is the cheapest, most reliable way to inject that specification after the fact.

## Core Hypothesis

Applying systematic testing to a vibe-coded repo will:
1. Surface the most painful bugs fastest (Pareto principle: 20% of tests catch 80% of issues)
2. Create a regression safety net that makes further vibe-coding safer
3. Produce a de-facto specification that constrains future AI contributions

## Reading Path

- [[wiki/columns/vibe-code-maintenance/problem-statement.md|Problem Statement]]: why vibe coding creates maintenance debt
- [[wiki/columns/vibe-code-maintenance/testing-strategies.md|Testing Strategies]]: which testing approaches fit which repo patterns
- [[wiki/columns/vibe-code-maintenance/diagnostic-workflow.md|Diagnostic Workflow]]: step-by-step process for triaging a vibe repo
- [[wiki/columns/vibe-code-maintenance/case-studies.md|Case Studies]]: real-world vibe-coded repos and their failure modes

## Research Agenda

1. **Taxonomy of vibe-code failures**: categorize the most common bug patterns (missing null checks, unhandled edge cases, broken error paths, state inconsistency)
2. **Testing ROI for vibe repos**: measure how many bugs each test class catches per hour invested
3. **Test-as-spec pattern**: formalize the workflow of reverse-engineering specifications through tests
4. **Vibe-code health score**: a composite metric combining test coverage, issue velocity, and PR merge rate

## Candidate Repos

Repositories to study (selected for high vibe-coding signals: rapid feature velocity, thin tests, many open issues):

| Repo | Language | Stars | Issues | Vibe Signal |
|------|----------|-------|--------|-------------|
| OpenClaw | TypeScript | growing | many | heavy AI-generated feature surface |
| (to be expanded) | | | | |

## Related Pages

- [[wiki/columns/ai-se-testing/index.md|AI SE Testing Column]]
- [[wiki/columns/ai-se-testing/ci-and-regression.md|CI And Regression]]
- [[wiki/columns/agent-work-patterns/feedback-loops.md|Feedback Loops]]
- [[wiki/concepts/compilation-over-retrieval.md|Compilation Over Retrieval]]
