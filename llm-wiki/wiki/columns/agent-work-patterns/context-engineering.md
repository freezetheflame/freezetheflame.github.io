# Context Engineering

## Summary

Context engineering is the practice of designing the information an agent receives at the start of a task. The agent's context — its system prompt, memory, skill instructions, and the user's message — determines everything it can know and do. Good context engineering makes the difference between an agent that needs constant correction and one that gets it right on the first try.

## Why It Matters

An agent's context window is its entire world. It cannot know anything outside of what you put into that window. Conversely, *everything* in that window competes for its attention. Too much irrelevant context is as harmful as too little relevant context.

## The Context Budget

Every token in the context window has a cost:
- **Attention cost**: the agent must process every token to find what matters
- **Distraction cost**: irrelevant information can pull the agent toward wrong approaches
- **Memory cost**: earlier context gets diluted as the window fills (lost-in-the-middle effect)

Treat context like a budget. Spend tokens on what the agent *must* know; cut everything else.

## What to Include

### Essential Context

1. **The task description** — concrete, scoped, with a clear deliverable
2. **Relevant file paths** — exactly which files to read or modify
3. **Constraints** — scope boundaries, style rules, safety rules
4. **Examples** — concrete input-output pairs for expected behavior
5. **Known pitfalls** — "the config file uses TOML, not YAML" or "don't use async — the codebase is synchronous"

### Project-Level Context (via AGENTS.md / CLAUDE.md / .cursorrules)

For recurring agent work in a repository, maintain a project context file. This is more efficient than repeating the same instructions every time.

What belongs in project context:
- Project structure and conventions
- Build/test commands
- Dependency notes ("we're pinned to Python 3.10")
- Common pitfalls specific to this codebase

### Cross-Session Context (via Memory)

For Hermes Agent specifically, use the `memory` tool to store durable facts:
- User preferences ("uses SSH for git, not HTTPS with PAT")
- Environment facts ("running in WSL, Windows mounts at /mnt/c/")
- Tool quirks ("deepseek-v4-pro does not support vision")

These are injected into every turn automatically, so you don't need to repeat them.

## What to Exclude

### Noise to Cut

- **Irrelevant file contents**: don't include the entire codebase when the agent only needs one module
- **Historical logs**: don't include past conversation transcripts unless they contain a decision the agent needs
- **Exploratory context**: don't include "nice to know" information — if it's not actionable, cut it
- **Duplicate instructions**: if a skill already covers a workflow, don't re-explain it in the prompt

### The "Everything Bagel" Trap

The most common context engineering mistake is including everything "just in case." This backfires because:
- The agent spends attention on irrelevant details
- Important instructions get buried in the noise
- The agent hallucinates connections between unrelated pieces of information

If you're not sure whether something belongs, ask: "If the agent ignores this entirely, will the task still succeed?" If yes, cut it.

## Context Layering

Instead of putting everything in one flat prompt, layer context by priority:

### Layer 1: System-Level (stable, always present)
- Agent persona and operating rules
- Memory entries (durable facts)
- Loaded skills

### Layer 2: Task-Level (changes per task)
- The specific task description
- File paths and constraints
- Examples and pitfalls

### Layer 3: Environment-Level (auto-detected)
- Current working directory
- Available tools
- Shell environment

The agent should get Layer 1 automatically. You control Layer 2. Layer 3 is injected by the platform.

## Prompt Patterns That Work

### The "Template" Pattern

For recurring task types, create a template that standardizes what context to provide. Example for a code review task:

```
Review PR #123. Focus on:
- Security: any input validation gaps?
- Correctness: does the logic handle edge cases?
- Style: does it follow the project conventions in AGENTS.md?

Files changed: src/auth.py, tests/test_auth.py
Do NOT comment on: formatting (handled by formatter), test coverage percentage
```

### The "Negative Space" Pattern

Explicitly state what the agent should NOT do. This is often more valuable than stating what it should do, because agents default to being helpful in ways that might not match your intent.

"Generate a SQL migration. Do NOT: add indexes you think might help, refactor existing columns, or change the migration naming convention. Only create the columns described."

### The "Checkpoint" Pattern

For tasks that require multiple steps, build checkpoints into the context so the agent validates its own work before proceeding.

"Step 1: Read the three files listed. Summarize your understanding in 2-3 sentences. Pause and wait for confirmation before proceeding to Step 2."

## The First-Message Leverage

The first message in a conversation has disproportionate influence. The agent uses it to anchor its understanding of the task, your expectations, and the relevant context. Invest extra effort in crafting the first message — it pays off across the entire session.

A good first message:
- States the goal in one sentence
- Lists the concrete deliverable
- Specifies constraints
- Includes one example
- Names the files involved

## Sources

- Patterns derived from hands-on use of Hermes Agent, Claude Code, and Codex CLI
- Context-window behavior documented in LLM benchmarking literature (lost-in-the-middle effect, attention dilution)

## Related Pages

- [[wiki/columns/agent-work-patterns/effective-delegation.md|Effective Delegation]]
- [[wiki/columns/agent-work-patterns/feedback-loops.md|Feedback Loops]]
- [[wiki/concepts/compilation-over-retrieval.md|Compilation Over Retrieval]]
- [[wiki/columns/agent-work-patterns/index.md|Agent Work Patterns Column]]
