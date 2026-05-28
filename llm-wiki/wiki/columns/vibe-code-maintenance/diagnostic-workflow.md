# Diagnostic Workflow: Triaging a Vibe-Coded Repo

## Overview

This is a repeatable, step-by-step process for assessing and beginning to heal a vibe-coded repository. It's designed to produce actionable results within a single focused session (1-3 hours).

The workflow prioritizes *signal* over *completeness*. You're not trying to fix everything — you're trying to find the highest-leverage interventions.

## Phase 1: Repo Triage (15-30 min)

### Step 1: Quick Structural Scan

```bash
# Clone and get basic stats
git clone <repo> && cd <repo>
cloc .                          # lines of code by language
find . -name "*.test.*" -o -name "*.spec.*" -o -name "*_test.*" | wc -l  # test file count
cat package.json | jq '.scripts.test'  # or equivalent
```

Assess:
- **Language/stack**: what are we working with?
- **Codebase size**: <5K LOC (small), 5-20K (medium), >20K (large)
- **Test presence**: any tests at all? what framework?

### Step 2: Issue Scan

```bash
gh issue list --limit 50 --state open --json number,title,labels,createdAt \
  | jq -r '.[] | "#\(.number) \(.title) (\(.createdAt[:10]))"'
```

Categorize issues into:
- **Crash/error**: "throws TypeError", "500 error", "crashes when"
- **Edge case**: "doesn't work with empty input", "fails on large files"
- **Feature request**: "add support for", "would be nice if"
- **Docs/UX**: "confusing error message", "README is wrong"

The crash/error + edge case count tells you how much specification debt exists.

### Step 3: PR Scan

```bash
gh pr list --limit 30 --state open --json number,title,createdAt \
  | jq -r '.[] | "#\(.number) \(.title) (\(.createdAt[:10]))"'
```

Look for:
- **Bug fix PRs that reference no test**: red flag — fixes without regression protection
- **Stale PRs**: open >2 weeks suggests review bottleneck or uncertainty
- **Revert PRs**: evidence of failed deploys or broken merges

### Step 4: Quick Quality Signals

```bash
# Test coverage (if available)
npm test -- --coverage 2>/dev/null || pytest --cov 2>/dev/null

# Linter violations
npx eslint . --format json 2>/dev/null | jq 'length'

# Type errors (TypeScript)
npx tsc --noEmit 2>&1 | wc -l
```

Record baselines. The goal is not to fix everything — it's to measure the gap.

## Phase 2: Diagnostic Output

After Phase 1, produce a one-page diagnostic:

```markdown
## Diagnostic: <repo-name>

**Size**: X lines of Y
**Tests**: N test files, Z% coverage (or "none")
**Open issues**: M total, P crashes/edge-cases, Q feature requests
**Open PRs**: R total, S bug fixes (T with tests)
**Linter**: U warnings, V errors
**Vibe signal**: HIGH / MEDIUM / LOW

**Top 3 failure modes** (from issue scan):
1. [most common crash pattern]
2. [most common edge case]
3. [most impactful missing feature]

**Recommended first intervention**: [highest-ROI test strategy]
```

## Phase 3: First Intervention (30-90 min)

Based on the diagnostic, pick ONE intervention:

### If no tests exist → Smoke Test
Write a single end-to-end smoke test for the primary user flow. This alone catches config issues, broken deploys, and complete regressions.

### If many crash issues → Top-3 Issue-Driven Tests
Pick the three most-reported crash issues. Write tests that reproduce them. Fix the code. Close the issues.

### If medium test coverage → Property-Based Tests
Pick the most complex public function. Write a property test. See what breaks.

### If stable but fragile → CI Guardrails
If the repo already has tests but PRs keep breaking things, add a CI workflow that runs tests on every PR.

## Phase 4: Report and Handoff

After the intervention, produce:

1. **What was done**: tests added, bugs fixed, issues closed
2. **What was found**: new bugs discovered during testing
3. **What's next**: recommended next intervention
4. **Health delta**: before/after metrics (tests: 0→1, issues closed: 3, etc.)

## Repeatability

This workflow is designed to be run repeatedly against the same repo (deepening the test suite) or against new repos (expanding the case study base). Each run should take 1-3 hours and produce measurable improvement.

## Tools Reference

| Task | Tool |
|------|------|
| Clone + stats | `gh repo clone`, `cloc` |
| Issue analysis | `gh issue list --json` |
| PR analysis | `gh pr list --json` |
| Test running | `npm test`, `pytest`, `cargo test` |
| Coverage | `--coverage`, `--cov` |
| Linting | `eslint`, `ruff`, `clippy` |
| Type checking | `tsc --noEmit`, `mypy` |

## Related Pages

- [[wiki/columns/vibe-code-maintenance/testing-strategies.md|Testing Strategies]]
- [[wiki/columns/vibe-code-maintenance/case-studies.md|Case Studies]]
- [[wiki/columns/vibe-code-maintenance/problem-statement.md|Problem Statement]]
