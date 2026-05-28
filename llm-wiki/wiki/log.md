# Log

## 2026-05-29

- Created the Vibe Code Maintenance column with four initial pages: Problem Statement, Testing Strategies, Diagnostic Workflow, and Case Studies. This column flips the AI-testing relationship: instead of using AI to generate tests, use traditional testing discipline to heal vibe-coded repositories. It complements AI SE Testing (can AI test?) and Agent Work Patterns (how to work with AI).
- Added the column to wiki/index.md, app/wiki-data.js, and the Open Research Tracks.
- Set up idea capture system: ~/ideas/inbox.md for quick-capture, ~/ideas/add-idea.sh for CLI addition, and a daily cron job (check-idea-inbox.py) that nudges on stale (>3 day) ideas.

## 2026-05-27

- Created the Agent Work Patterns column with three initial pages: Effective Delegation, Context Engineering, and Feedback Loops.
- Added authoritative web references to all three topic pages.
- Fixed markdown table rendering in wiki-core.js and added table CSS styles.
- Complete UI redesign inspired by lucasastorian/llmwiki: modern CSS design system, tree sidebar navigation, auto-generated TOC, blockquote/horizontal-rule markdown support, dual-column homepage dashboard.

## 2026-05-05

- Finalized the first research direction as `RepoMemoryBench`, a benchmark-first study of whether current general software agents fail on testing tasks because they lack testing-specific project memory.
- Added a RepoMemoryBench literature collection plan and source matrix, plus raw source metadata for the first collection pass.
- Reframed the research agenda as `RepoMemoryBench -> RepoMemoryTest`, with a benchmark-first measurement stage followed by a testing-specific memory harness method.
- Added a testing memory related-work map to separate general agent memory from testing-specific history and CI knowledge.
- Captured `RepoMemoryTest: Project-Memory-Guided Agentic Regression Testing` as the first paper seed, including proposal, progress, and experiment design pages.
- Added a reader-facing dashboard to the local wiki home page with current focus, roadmap phases, AI SE Testing page cards, research lanes, and source shortcuts.
- Added `columnPages` filtering so dashboard sections can use reader-visible column pages without exposing maintenance pages.

## 2026-05-04

- Enriched `wiki/index.md` with a roadmap for AI-assisted automated software engineering testing, including research radar, testing agent design, prototype experiments, and CI-loop phases.
- Added the AI SE Testing column with a curated reading list and topic pages for test generation, SWE agent evaluation, CI/regression, and testing frameworks.
- Hid agent maintenance pages from the default reader navigation by adding reader-vs-maintenance page audience metadata.
- Moved maintenance links into `wiki/meta/project-maintenance.md`.
- Added public wiki agent workspace under `agent/`, including profile, operating rules, skills, and repo-synced project memory.
- Added `.gitignore` entries for `.wiki-agent/`, `.env`, local files, and `node_modules/`.
- Ingested the WeChat article "微软M*：自进化的记忆Harness" as metadata plus original synthesis.
- Added `Memory Harness` concept page and linked it to the M* source page.

## 2026-05-03

- Created initial LLM wiki starter with raw source storage, compiled wiki pages, browser reader, and operating rules.
- Added seed synthesis of the Karpathy LLM wiki pattern.
- Added first workflows for ingest, query, and lint.
