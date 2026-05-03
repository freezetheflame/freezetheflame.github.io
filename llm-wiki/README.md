# LLM Wiki Starter

This is a local, Codex-friendly LLM wiki starter. It follows the shape of Andrej Karpathy's public idea: keep raw source material separate from a compiled wiki, make the wiki easy for an LLM to maintain, and file valuable answers back into durable pages.

## Quick Start

```powershell
npm test
npm run check
npm run serve
```

Then open `http://localhost:4173`.

If the system `node` cannot run inside the sandbox, use the Codex bundled Node executable shown by the workspace dependencies tool.

## How To Use It

- Put original material in `raw/`.
- Add synthesized pages under `wiki/`.
- Update `wiki/index.md` and `app/wiki-data.js` when adding pages.
- Use `wiki/log.md` as an append-only changelog.
- Ask Codex to ingest a file, answer from the wiki, or lint the wiki.

## Structure

- `AGENTS.md`: operating rules for Codex or other coding agents.
- `app/`: static reader with search, tags, and wiki links.
- `docs/superpowers/specs/`: design notes for this starter.
- `raw/`: immutable source storage.
- `tests/`: JavaScript behavior tests for the browser core.
- `wiki/`: compiled knowledge pages.
