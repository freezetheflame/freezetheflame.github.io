# LLM Wiki Starter Design

## Goal

Build a local starter wiki inspired by Karpathy's LLM wiki pattern. The result should be usable immediately in this workspace, readable in a browser, and maintainable by future Codex sessions.

## Approach

Use a static Markdown vault plus a dependency-free browser reader. This keeps the system portable and makes the content editable as normal files.

## Components

- `raw/`: immutable source storage.
- `wiki/`: compiled Markdown knowledge pages.
- `AGENTS.md`: operating rules for future agent sessions.
- `app/`: local reader with page navigation, search, tags, and wiki-link rendering.
- `tools/serve.mjs`: small static server.
- `tests/wiki-core.test.mjs`: behavior checks for search, links, slugging, and Markdown rendering.

## Data Flow

Source material is preserved in `raw/`. Durable synthesis is written into `wiki/`. The browser app reads page metadata from `app/wiki-data.js` and fetches Markdown files directly from `wiki/`.

## Verification

Run `npm test` for behavior and `npm run check` for JavaScript syntax. Open the local app in a browser and confirm that the index, links, search, and layout work.
