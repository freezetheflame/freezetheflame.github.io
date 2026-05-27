# Feedback Loops

## Summary

AI agents rarely produce perfect output on the first attempt. The key to reliable agent workflows is not getting everything right upfront — it is building fast, tight feedback loops that catch errors early and correct them before they compound. This page describes the review-correct-optimize cycle and how to make it efficient.

## Why It Matters

An agent's first output is a draft. Treating it as a final deliverable leads to frustration, bugs, and rework. Treating it as the start of an iteration cycle leads to progressively better results with less human effort.

The difference between a productive agent user and a frustrated one is usually not the model quality — it is the speed and quality of their feedback loops.

## The Review-Correct-Optimize Cycle

```
  ┌──────────────────────────┐
  │ 1. DELEGATE              │
  │   Clear task + context   │
  └───────────┬──────────────┘
              ▼
  ┌──────────────────────────┐
  │ 2. AGENT PRODUCES        │
  │   Draft output           │
  └───────────┬──────────────┘
              ▼
  ┌──────────────────────────┐
  │ 3. REVIEW                │
  │   Quick sanity check     │
  └───────────┬──────────────┘
              ▼
       ┌─────┴─────┐
       │  CORRECT?  │
       └─────┬─────┘
       NO    │    YES
       ▼     │     ▼
  ┌────────┐ │ ┌──────────┐
  │CORRECT │ │ │ VERIFY   │
  │Targeted│ │ │ Run tests│
  │feedback│ │ │ / manual │
  └───┬────┘ │ └────┬─────┘
      │      │      │
      └──────┘   ┌──┴──┐
                 │PASS?│
                 └──┬──┘
              NO   │   YES
              ▼    │    ▼
          ┌──────┐ │ ┌──────────┐
          │CORRECT│ │ │ OPTIMIZE │
          │+ retry│ │ │ Polish,  │
          └───────┘ │ │ document │
                    │ └──────────┘
                    ▼
                 ┌──────┐
                 │ DONE │
                 └──────┘
```

## How to Review Agent Output

### Review Strategy: Triage First

Don't read agent output line-by-line like a code review. Triage:

1. **Does it run?** — If the agent generated code, run it immediately. Syntax errors and import failures surface instantly and are cheap to catch.
2. **Does it solve the stated problem?** — Skim the output against your original task description. If it solved a different problem, that's a delegation issue, not a quality issue.
3. **Are there obvious mistakes?** — Look for hallucinated APIs, wrong file paths, incorrect assumptions about the codebase.
4. **Is the approach sound?** — Only after passing the first three checks, evaluate whether the approach is good engineering.

If the output fails at step 1 or 2, don't bother with steps 3 and 4 — send it back with targeted feedback.

### Common Failure Modes to Scan For

- **Hallucinated APIs**: the agent invented a function that doesn't exist
- **Scope creep**: the agent did more than asked ("while I was here, I refactored the database layer")
- **Wrong assumptions**: the agent assumed a file structure or convention that doesn't match your project
- **Silent failures**: the agent claimed success but didn't actually verify (no test run, no build check)
- **Over-engineering**: the agent added abstraction layers, design patterns, or configurability you didn't ask for

## How to Give Corrective Feedback

### The "Targeted Correction" Formula

Bad feedback: "This doesn't work." (agent doesn't know what to fix)
Good feedback: "The `parse_date` function in `src/dates.py` returns `None` for ISO 8601 dates with timezone offsets. It should strip the timezone and return the date portion."

Elements of effective corrective feedback:
1. **Pinpoint the location**: which file, which function, which line
2. **State the actual behavior**: what the agent produced
3. **State the expected behavior**: what you wanted instead
4. **Give one concrete example**: input → current output → desired output

### The "One Thing" Rule

Correct one class of error at a time. If the agent made three different mistakes, pick the most impactful one and correct it first. Correcting everything at once often confuses the agent and leads to partial fixes.

### When to Reset vs. Refine

Sometimes the agent's approach is fundamentally wrong — not just buggy, but built on a misunderstanding of the problem. In these cases, don't iterate. Reset: start a new conversation or a new task delegation with clarified context.

Signs you should reset:
- The agent misunderstood the core problem (not just a detail)
- The agent keeps making the same mistake after 2+ corrections
- The output is structurally wrong (wrong architecture, wrong data model)
- You're spending more time correcting than it would take to re-delegate

## Optimizing After Success

Once the agent output passes review and verification, invest a small amount of effort to make it durable:

### File It Back

If the task produced a reusable insight, pattern, or workflow, save it:
- **Skill**: for repeatable multi-step workflows (use `skill_manage`)
- **Memory**: for durable facts (use `memory`)
- **Wiki page**: for synthesized knowledge (like this page)

### Document the Pitfall

If the agent needed correction for something non-obvious, add that pitfall to the relevant skill or project context. The next time you (or anyone) delegates a similar task, the agent will avoid the same mistake.

Example: after discovering that the agent kept using async in a sync codebase, add to `AGENTS.md`: "This project is synchronous. Do not introduce async/await."

## Measuring Loop Efficiency

Track these metrics to improve your feedback loops over time:

| Metric | What It Means | Good Target |
|--------|--------------|-------------|
| Rounds to success | How many review-correct cycles before the output is acceptable | 1-2 rounds for small tasks, 2-4 for medium |
| Time per round | How long between receiving output and sending feedback | <5 minutes for review, <2 minutes for writing feedback |
| Reset rate | How often you need to throw away and restart | <10% of tasks |
| Pitfall recurrence | How often the same mistake happens again | Should trend toward zero as pitfalls are documented |

## Anti-Patterns

### The "Fix Everything" Review

Listing 15 issues in one feedback message. The agent gets overwhelmed, fixes some superficially, breaks others, and the cycle degrades. Pick the top 1-3 issues per round.

### The "I'll Just Do It Myself" Pivot

Seeing imperfect output and immediately doing the work manually. This trains you to expect perfection on round one (unrealistic) and prevents you from developing the feedback skill. Even when the agent is 70% right, invest in correction — it builds patterns that make the agent 90% right next time.

### The "Silent Approval"

Accepting agent output without verification, then discovering problems later. Always verify before accepting. The verification step is non-negotiable for any output that will be committed, deployed, or shared.

## Sources

- Hands-on iteration patterns from Hermes Agent, Claude Code, and Codex CLI workflows
- Review practices adapted from human code review literature and pair programming research

## Related Pages

- [[wiki/columns/agent-work-patterns/effective-delegation.md|Effective Delegation]]
- [[wiki/columns/agent-work-patterns/context-engineering.md|Context Engineering]]
- [[wiki/columns/agent-work-patterns/index.md|Agent Work Patterns Column]]
- [[wiki/concepts/compilation-over-retrieval.md|Compilation Over Retrieval]]
