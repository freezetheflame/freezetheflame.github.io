# AI SE Testing Column Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reader-facing AI software engineering testing column while hiding maintenance-only agent pages from the default wiki reader.

**Architecture:** Keep the wiki file-first. Add `audience` metadata to page records so the browser can show reader pages by default while still allowing direct access to maintenance pages.

**Tech Stack:** Static Markdown, vanilla JavaScript, Node test scripts.

---

### Task 1: Hide Maintenance Pages

**Files:**
- Modify: `app/wiki-core.js`
- Modify: `app/app.js`
- Test: `tests/wiki-core.test.mjs`

- [x] **Step 1: Write the failing test**

```js
assert.deepEqual(
  readerPages([
    { path: "wiki/index.md", audience: "reader" },
    { path: "agent/profile.md", audience: "maintenance" },
    { path: "wiki/overview.md" },
  ]).map((page) => page.path),
  ["wiki/index.md", "wiki/overview.md"],
);
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm test`

Expected: FAIL because `readerPages` is not exported.

- [x] **Step 3: Write minimal implementation**

```js
export function readerPages(pages) {
  return pages.filter((page) => page.audience !== "maintenance");
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npm test`

Expected: PASS.

### Task 2: Add AI SE Testing Column

**Files:**
- Create: `wiki/columns/ai-se-testing/index.md`
- Create: `wiki/columns/ai-se-testing/reading-list.md`
- Create: `wiki/columns/ai-se-testing/test-generation.md`
- Create: `wiki/columns/ai-se-testing/swe-agent-evaluation.md`
- Create: `wiki/columns/ai-se-testing/ci-and-regression.md`
- Create: `wiki/columns/ai-se-testing/testing-frameworks.md`
- Create: `raw/sources/ai-se-testing-reading-list.md`
- Modify: `wiki/index.md`
- Modify: `app/wiki-data.js`
- Modify: `wiki/log.md`

- [x] **Step 1: Add column pages**

Create pages with summaries, source links, and related-page links.

- [x] **Step 2: Update reader navigation**

Add only reader-facing column pages to `wiki/index.md` and `app/wiki-data.js`.

- [x] **Step 3: Update logs and source ledger**

Record the research set in `wiki/log.md`, `raw/sources/ai-se-testing-reading-list.md`, and `agent/memory/source-ledger.md`.

### Task 3: Add Maintenance Hub

**Files:**
- Create: `wiki/meta/project-maintenance.md`
- Modify: `app/wiki-data.js`

- [x] **Step 1: Create maintenance page**

Create a single maintenance index that links to `agent/` profile, rules, skills, and memory.

- [x] **Step 2: Mark maintenance entries**

Set `audience: "maintenance"` for agent and meta pages in `app/wiki-data.js`.

### Task 4: Verify And Publish

**Files:**
- Modify: git commit only intended files.

- [ ] **Step 1: Run checks**

Run: `npm test` and `npm run check`.

- [ ] **Step 2: Run local HTTP smoke check**

Run the static server and verify `/`, `/wiki/columns/ai-se-testing/index.md`, and `/wiki/meta/project-maintenance.md` return 200.

- [ ] **Step 3: Commit and push**

Run: `git add ...`, `git commit -m "Add AI SE testing column"`, and `git push origin main`.
