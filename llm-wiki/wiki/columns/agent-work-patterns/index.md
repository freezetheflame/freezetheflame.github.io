# Agent Work Patterns Column

## Summary

This column collects practical patterns for working effectively with AI coding agents — how to delegate, how to engineer context, how to iterate, and how to get reliable results from non-deterministic systems. Unlike the AI SE Testing column (which studies agent capabilities from a research perspective), this column is about the *human side* of agent collaboration: what works, what fails, and what habits make agents productive partners.

## Why This Column Exists

LLM agents are powerful but unpredictable. The gap between "the agent can do X in theory" and "the agent reliably does X for me" is filled by workflow design, context engineering, and iteration discipline. These patterns are not documented in any single paper — they emerge from hands-on experience across many users and agent platforms.

## Core Topics

- [[wiki/columns/agent-work-patterns/effective-delegation.md|Effective Delegation]]: How to scope and describe tasks so agents succeed on the first attempt.
- [[wiki/columns/agent-work-patterns/context-engineering.md|Context Engineering]]: What information to give agents — and what to withhold — so they stay focused and accurate.
- [[wiki/columns/agent-work-patterns/feedback-loops.md|Feedback Loops]]: The review-correct-optimize cycle that turns agent output from "mostly right" to production-grade.

## Working Thesis

Agents are not autonomous experts. They are **amplified tools** that work best when the human provides clear boundaries, concrete expectations, and structured feedback. The best agent workflows treat the human as the architect and the agent as the builder — not the other way around.

## Reading Path

Start with [[wiki/columns/agent-work-patterns/effective-delegation.md|Effective Delegation]] to understand task scoping, then move to [[wiki/columns/agent-work-patterns/context-engineering.md|Context Engineering]] for prompt and context design, and finish with [[wiki/columns/agent-work-patterns/feedback-loops.md|Feedback Loops]] for the iteration cycle.

## Related Pages

- [[wiki/concepts/compilation-over-retrieval.md|Compilation Over Retrieval]]: Why durable knowledge matters for agent workflows.
- [[wiki/concepts/memory-harness.md|Memory Harness]]: Task-specific memory as a foundation for reliable agent behavior.
- [[wiki/sources/karpathy-llm-wiki.md|Karpathy LLM Wiki Pattern]]: The wiki itself as an example of agent-human collaboration.
