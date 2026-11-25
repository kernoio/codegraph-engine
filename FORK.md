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

**Last synced upstream commit:** [`d0996a2`](https://github.com/colbymchenry/codegraph/commit/d0996a2) (`main`, 2026-09-16 — BE-3189).

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
- `kerno-next-app-router` — `app/**/route.ts` re-export HTTP handlers (`export { GET } from '…'`); stock upstream `nextjs` owns direct `function`/`const` handler exports and page routes
- `kerno-nestjs` — NestJS HTTP/GraphQL/WS routes (replaces stock `nestjs` resolver)
- `kerno-go-http` — Gin/Echo/Fiber/Chi + gorilla/mux prefix merging (replaces stock `go` resolver)
- `kerno-php-http-routes` — Laravel routes (replaces stock `laravel` resolver)
- plus dedicated resolvers for Fastify, Koa, Hono, Hapi, AdonisJS, Remix, and other frameworks stock upstream does not cover (see `src/plugins/README.md`)

No auto-discovery of arbitrary `node_modules` packages inside the agent sandbox.

## Image delivery

The `kernoio/codegraph` Docker image builds from this repo (not npm
`@colbymchenry/codegraph`). Aicore pins the image digest in `agent/gradle.properties`.

## npm delivery

Published as **`@kerno/codegraph`** plus one `@kerno/codegraph-<platform>-<arch>`
bundle per target, by `.github/workflows/release.yml` (Actions → Release → Run
workflow, after bumping `package.json`). Same thin-installer shape as upstream's
`@colbymchenry/codegraph`; only the scope and the release repo differ, so
`npm-shim.js`'s self-heal and `codegraph upgrade` fetch from this repo's GitHub
Releases, never upstream's. `@kerno/codegraph-ui` is not published (`ui/` stays
`private`).

Upstream is MIT. Every package ships `LICENSE` (Colby Mchenry's notice, kept
verbatim) and the platform bundles also ship `NODE-LICENSE` for the vendored
Node runtime. Don't drop either.

Telemetry is **off by default** (`src/telemetry/index.ts` `getStatus`): it reports
to upstream's endpoint, a third party for Kerno users. Only an explicit choice
turns it on; upstream's `default-notice` record is ignored. Keep this when
rebasing; `__tests__/telemetry.test.ts` pins it.

The installer still offers upstream's "CodeGraph Pro" beta waitlist
(`src/installer/beta-signup.ts`), which sends the email typed in to
getcodegraph.com. `kerno audit` never runs the installer.

npm auth is OIDC trusted publishing. A trusted publisher can only be added to a
package that exists, so the very first release (and the first release of any
new platform package) runs with a short-lived `NPM_TOKEN` secret; then each
package gets `kernoio/codegraph-engine` + `release.yml` as trusted publisher on
npmjs.com and the secret is deleted.

When rebasing onto upstream, re-run
`git grep -n colbymchenry -- scripts src install.sh install.ps1 package.json .github`
and keep the distribution names on `@kerno` / `kernoio/codegraph-engine`.
