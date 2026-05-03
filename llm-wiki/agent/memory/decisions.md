# Decisions

## 2026-05-04: Use Repo Memory plus Local Private Overlay

Shared project memory should live in `agent/memory/` so multiple computers can sync the wiki agent's context through GitHub. Private notes, secrets, and sensitive user data should live in `.wiki-agent/`, which is ignored by git.

## 2026-05-04: Treat This Repository as Public

All committed source notes, memory, and wiki pages must be safe for a public GitHub repository.
