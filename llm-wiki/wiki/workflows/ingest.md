# Ingest Workflow

## Goal

Add one new source without making the wiki noisy.

## Steps

- Store the original material under `raw/`.
- Read `wiki/index.md` and any related pages.
- Decide whether to update an existing page or create a new page.
- Write synthesis into `wiki/`, not a transcript of the source.
- Update `wiki/index.md` and `app/wiki-data.js` if a page is added.
- Append the change to `wiki/log.md`.

## Done Means

- The source can be found later.
- The compiled point can be found from the index or search.
- The page names uncertainty or source limits.
