# RepoMemoryTest Experiment Design

## Goal

First evaluate whether current agents expose a project-memory gap in regression-oriented testing tasks. Then evaluate whether a testing-specific memory harness closes part of that gap.

## Experimental Units

Each task should contain:

- repository snapshot,
- change, issue, or failing CI signal,
- available test commands,
- expected validation signal,
- optional historical memory from earlier tasks.

## Agent Variants

- **A0 Stateless**: sees only the current task and repository.
- **A1 Retrieval Memory**: can retrieve previous notes through semantic search.
- **A2 Structured Memory**: can read and update typed memory records.
- **A3 Hybrid Memory**: combines structured records with semantic retrieval.

## Candidate Real-World Agents

The benchmark should include representative agents only when they are reproducible and scriptable enough for fair comparison.

- SWE-agent or a similar academic SWE agent.
- OpenHands or another open-source autonomous SWE agent.
- A CLI coding agent that can operate over a repository and run shell commands.
- A stateless LLM baseline using the same task prompt and repository context.
- A retrieval-memory wrapper baseline.

Avoid adding an agent only because it is popular if logs, configuration, or automation cannot be controlled.

## Memory Records

- `commands`: reliable test commands, scope, cost, and when to use them.
- `failure_signatures`: recurring error text, suspected cause, and known fix path.
- `flaky_tests`: test name, failure mode, reproduction rate, mitigation.
- `environment_traps`: setup commands, dependency issues, OS or version constraints.
- `module_risk`: modules associated with high regression risk.
- `generated_tests`: generated test, trigger, validation command, result, and review status.

## Task Loop

1. Read current task and available memory.
2. Inspect repository structure.
3. Select focused validation commands.
4. Run tests and parse results.
5. If appropriate, generate or repair tests.
6. Run focused validation again.
7. Run broader regression validation.
8. Update memory with only validated observations.

## Metrics

- Focused command precision.
- Time to first useful failure signal.
- Final validation success.
- Regression detection rate.
- Test quality score from coverage, mutation signal, and review labels.
- Memory usefulness: whether later tasks reuse prior memory correctly.
- Cost: token use, tool calls, wall-clock time.

## Pilot Plan

Start with a small local benchmark:

- 3 to 5 open-source repositories.
- 5 to 10 tasks per repository.
- Python and JavaScript first, because test commands are easy to automate.
- Use existing tests and synthetic regressions before moving to real historical bugs.

## Expected Contribution Shape

- Stage 1: a benchmark and empirical study showing the testing-memory gap in current agents.
- Stage 2: a memory schema for agentic regression testing.
- Stage 2: an agent loop that uses memory as a first-class testing tool.
- Stage 2: an empirical comparison of stateless, retrieval, structured, and hybrid memory.
