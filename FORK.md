# Kerno codegraph-engine fork

Fork of [colbymchenry/codegraph](https://github.com/colbymchenry/codegraph) for Kerno-owned
framework detectors and an explicit plugin system.

## Sync cadence

- Pin the upstream base commit in this file when rebasing.
- **New detectors live under `src/plugins/<name>/`** — never patch stock
  `src/resolution/frameworks/*.ts` for Kerno-only frameworks when a plugin can
  own the extract logic (tsoa, Next App Router `route.ts`, …).
- Monthly: cherry-pick or rebase onto upstream `main`; resolve conflicts favoring
  Kerno plugins.

**Base upstream commit at fork time:** see `git log --oneline` first parent after fork,
or `git merge-base HEAD colbymchenry/codegraph/main` once the remote is added.

```bash
git remote add upstream https://github.com/colbymchenry/codegraph.git
git fetch upstream
git merge-base HEAD upstream/main
```

## Plugin model (v1)

| Kind | How it loads | Publish to npm? |
|------|----------------|-----------------|
| **In-repo built-ins** | `src/plugins/*` via `getBuiltInPlugins()` + registration into `FRAMEWORK_RESOLVERS` | No |
| **Project-configured** | `codegraph.json` `"plugins": ["./local", "@scope/pkg"]` | Optional |

Built-ins today:

- `kerno-tsoa` — `@Route` + HTTP method decorators
- `kerno-next-app-router` — `app/**/route.ts` HTTP exports (`function` / `const` / re-export)

No auto-discovery of arbitrary `node_modules` packages inside the agent sandbox.

## Image delivery

The `kernoio/codegraph` Docker image builds from this repo (not npm
`@colbymchenry/codegraph`). Aicore pins the image digest in `agent/gradle.properties`.
