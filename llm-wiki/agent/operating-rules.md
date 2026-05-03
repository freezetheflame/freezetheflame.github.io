# Wiki Agent Operating Rules

## Memory Model

This repository uses Repo Memory plus Local Private Overlay.

- Repo Memory lives in `agent/memory/` and is safe to sync through GitHub.
- Local Private Overlay lives in `.wiki-agent/` and must not be committed.

## Public Memory Standard

Only commit information that can safely appear in a public repository:

- Project decisions.
- Non-sensitive user preferences about workflow.
- Source metadata and source-ledger entries.
- Open questions about the wiki.
- Concepts that repeatedly appear across sources.

Do not commit API keys, private account details, personal identifiers, unpublished private notes, employer-confidential material, medical details, financial details, or anything the user marks private.

## Ingest Standard

When ingesting a copyrighted article, save metadata and your own synthesis. Do not preserve the full article text unless the user owns it or explicitly says it is licensed for that use.

## Change Standard

Every wiki change should update at least one of:

- `wiki/index.md`
- `wiki/log.md`
- `app/wiki-data.js`
- `agent/memory/source-ledger.md`

Run available checks before claiming completion.
