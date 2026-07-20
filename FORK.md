# Kerno codegraph-engine fork

Fork of [colbymchenry/codegraph](https://github.com/colbymchenry/codegraph) for Kerno-owned
framework detectors and an explicit plugin system.

## Sync cadence

- Pin the upstream base commit in this file when rebasing.
- Prefer new detectors as plugins under `src/plugin-system/` / `src/resolution/frameworks/`
  over drive-by edits to unrelated core code.
- Monthly: cherry-pick or rebase onto upstream `main`; resolve conflicts favoring Kerno plugins.

**Base upstream commit at fork time:** see `git log --oneline` first parent after fork,
or `git merge-base HEAD colbymchenry/codegraph/main` once the remote is added.

```bash
git remote add upstream https://github.com/colbymchenry/codegraph.git
git fetch upstream
git merge-base HEAD upstream/main
```

## Plugin model (v1)

- Built-in Kerno plugins always load (e.g. tsoa).
- Additional packages only via `codegraph.json` `"plugins": ["@kerno/..."]`.
- No auto-discovery of arbitrary `node_modules` packages inside the agent sandbox.

## Image delivery

The `kernoio/codegraph` Docker image builds from this repo (not npm
`@colbymchenry/codegraph`). Aicore pins the image digest in `agent/gradle.properties`.
