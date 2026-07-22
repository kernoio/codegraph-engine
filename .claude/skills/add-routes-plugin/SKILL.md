---
name: add-routes-plugin
description: Add HTTP endpoint/route detection for a web framework as an in-repo Kerno plugin — research the framework's route-definition syntaxes online, write a FrameworkResolver plugin under src/plugins/, and prove it works with real-repo fixtures, a factory-line mini-repo case, and a cloned OSS repo. Use when the user runs /add-routes-plugin <framework> or asks to add/support/fix endpoint or route detection for a framework (e.g. Fastify, Hono, Ktor, Phoenix, Actix).
---

# Add endpoint route detection for a framework

Build a route-detection plugin for a web framework, end-to-end: **research
online** how routes are defined (all syntaxes, not just the tutorial one),
**write** an in-repo plugin under `src/plugins/`, and **prove** it works on
real-world code via fixture tests, a factory-line case, and a cloned OSS repo.
Runs autonomously. **Never commit, push, publish, or tag** — leave changes for
the user to review.

The argument is the framework name (e.g. `fastify`, `ktor`, `phoenix`). If none
was given, ask which framework, and which language it belongs to if ambiguous.

## Prerequisites
- Run from the codegraph repo root; `node`, `git`, `gh` available.
- The framework's **language must already be extracted** by codegraph (check
  `LANGUAGES` in `src/types.ts`). If not, stop and suggest `/add-lang` first.

## Background — how route detection works here

- Route detection lives in `FrameworkResolver`s (`src/resolution/types.ts:196`).
  A resolver has `detect(context)` (project-level, once at startup),
  `extract(filePath, content)` → `{ nodes, references }`, optional `resolve()` /
  `claimsReference()` for route→handler linking, and optional `postExtract()`
  for cross-file finalization (e.g. prefixes declared in a sibling file).
- **New detectors go in `src/plugins/<id>/`** (`index.ts` default-exporting a
  `CodeGraphPlugin` + `resolver.ts`), NOT in `src/resolution/frameworks/` —
  see `src/plugins/README.md`. Register in `src/plugins/index.ts`
  (`BUILTIN_PLUGINS` + re-export). If the plugin resolver's `name` matches a
  stock resolver in `src/resolution/frameworks/index.ts`, the registration loop
  **replaces** the stock one — that's the intended way to supersede a weak
  stock detector (like `go-http` and `php-http-routes` did).
- Route nodes use `kind: 'route'`. **HTTP handler routes must be named
  `VERB /path`** (`GET /api/users/{id}`) and/or carry `::route:VERB:` in
  `qualifiedName` — that's what `isHttpHandlerRoute` in
  `.har/factory-line/run.mjs` and `isNextHttpRouteHandler()` count for SCIP
  endpoint totals. UI/navigation routes (page paths without a verb) are fine
  as plain `/path` names but won't count as endpoints.
- Route→handler links are `references` edges, emitted as `UnresolvedRef`s from
  `extract()` and resolved by the normal pipeline (your `resolve()` is one
  strategy; use `claimsReference()` when the handler name isn't a declared
  symbol, e.g. `UserController@show`).
- Model plugins to copy from: `src/plugins/tsoa/` (decorator-based),
  `src/plugins/php-http-routes/` (call-chain/regex based, multi-flavor),
  `src/plugins/go-http/` (mux/subrouter walking), `src/plugins/nestjs-kerno/`
  (postExtract cross-file prefixes), `src/plugins/next-app-router/`
  (file-convention routing).

## Workflow

Copy this checklist and work through it in order:
```
- [ ] 1. Resolve framework; check existing coverage (stock resolver / plugin)
- [ ] 2. Research route definitions ONLINE — official docs + alternatives
- [ ] 3. Collect real-world evidence: 2+ OSS repos, cite exact files
- [ ] 4. Design detect() signals + route extraction shapes
- [ ] 5. Write the plugin (src/plugins/<id>/) + register it
- [ ] 6. Fixture tests from the cited real repos; update the registry test
- [ ] 7. Factory-line mini-repo case + manifest entry; run test:factory-line
- [ ] 8. Prove on a cloned real repo; check precision + control repo
- [ ] 9. CHANGELOG under [Unreleased]
- [ ] 10. Report; do NOT commit
```

### Step 1 — Resolve + check existing coverage

Grep for the framework in `src/resolution/frameworks/` and `src/plugins/`. Three
outcomes:
- **Not covered** → new plugin (the normal path).
- **Stock resolver exists but is weak** (misses syntaxes, under-counts) → new
  plugin with the **same resolver `name`** so it replaces the stock one; keep
  detector logic out of `src/resolution/frameworks/` (upstream-sync rule in
  `src/plugins/README.md`).
- **A plugin already covers it** → this becomes a gap-fix inside that plugin,
  not a new one. Still do Steps 2–3 to find what it misses.

### Step 2 — Research route definitions online (REQUIRED, don't skip to code)

Use WebSearch/WebFetch on the **official framework docs** first, then secondary
sources. The goal is an exhaustive inventory of route-definition forms —
under-counting comes from only handling the tutorial syntax. Hunt specifically
for:
- The canonical form (e.g. `app.get('/x', h)`, `@GetMapping("/x")`).
- **Every alternative**: config/declarative files (YAML/JSON route tables),
  annotations vs. programmatic registration, fluent/chained builders,
  route groups/prefixes/mounts/subrouters, resource/CRUD macros
  (`resources :users`), file-convention routing, versioning prefixes,
  catch-all `any`/`match` verbs, path-parameter syntaxes (`:id`, `{id}`,
  `<int:id>`) — normalize params to `{id}` style if the ecosystem is mixed.
- How handlers are referenced (closure inline, `Controller@method` string,
  class+method tuple, function ref) — this drives `references`/`resolve()`.
- How a project **declares the dependency** (package manifest key, marker
  files, import path) — this drives `detect()`.

Write the inventory down (a table of syntax → example → covered? works well) —
it goes in the final report and tells you when you're done.

### Step 3 — Real-world evidence (2+ OSS repos)

Find **at least 2 popular OSS repos** actually using the framework
(`gh search repos --language=<lang> --sort=stars ...` + docs' showcase pages).
From each, pull 1–3 real route-definition files (raw.githubusercontent.com).
These become the test fixtures — the house convention
(`__tests__/plugins/fixtures.ts`) is *fixtures cited from real repositories, 2+
sources per framework, to prove detectors are framework-level, not
repo-specific*. Keep the source URL + path in a comment above each fixture.
Prefer files that exercise different syntaxes from your Step-2 inventory
(groups, prefixes, resource macros — not just plain verbs).

### Step 4 — Design

- **`detect()`**: cheap and precise — manifest dependency keys first
  (`package.json`/`go.mod`/`composer.json`/`build.gradle`…), marker files
  second, content-scan regex last (see `phpHttpRoutesResolver.detect` for the
  layered pattern). Must not fire on unrelated projects.
- **`extract()`**: per-file, regex/light-parse over `content` (use
  `stripCommentsForRegex` from `src/resolution/strip-comments` before matching
  when comments can contain route-looking text). Emit route nodes named
  `VERB /full/path` with prefix/group context applied; emit `UnresolvedRef`s
  route→handler.
- Cross-file prefixes (module/router registration elsewhere) → `postExtract()`
  (preserve node `id` and `qualifiedName`, see the interface docstring).
- `languages: ['<lang>']` on the resolver so it only runs on relevant files.

### Step 5 — Write the plugin

```
src/plugins/<id>/index.ts     — CodeGraphPlugin (id: 'kerno-<id>', type: 'framework-resolver')
src/plugins/<id>/resolver.ts  — the FrameworkResolver
```
Register in `src/plugins/index.ts`: import, add to `BUILTIN_PLUGINS`, re-export
the resolver. Match the existing plugins' style exactly. `npm run build` must
pass.

### Step 6 — Tests

- Add fixtures to `__tests__/plugins/fixtures.ts` (cited, from Step 3).
- Add a `describe('<framework> plugin ...')` block to
  `__tests__/plugins/framework-plugins.test.ts` asserting `extract()` yields
  the exact expected `VERB /path` names per fixture, plus a `detect()`
  positive + negative.
- **Update the registry test** in the same file — the
  `'exposes all Kerno built-in framework plugins'` assertion hardcodes the
  sorted plugin-id and resolver-name lists; it fails until you add yours.
- Complex path/prefix logic → its own test file like
  `__tests__/plugins/go-http.test.ts`.
```bash
npx vitest run __tests__/plugins/
```
Green before continuing. Then run the full suite once (`npm test`) — a
same-name replacement of a stock resolver can break that resolver's old tests;
those tests should be updated to pin the new (better) behavior, not deleted.

### Step 7 — Factory-line case (the e2e proof)

Create a mini-repo case under `.har/factory-line/cases/<case-id>/`:
- `files/` — a minimal but realistic project tree (the manifest file that makes
  `detect()` fire + 1–2 route files from your fixtures, at framework-idiomatic
  paths).
- `expected.json` — `{ "framework": "...", "source": "<repo> — <path>",
  "routes": ["GET /...", ...] }`. Add `"endpointScope": "http-handler"` when
  extra route nodes would be wrong (strict set equality).

Add the case id to `miniRepos` in `.har/factory-line/manifest.json`.
Optionally add a real repo to `repos` (`minRoutes`, `optional: true`).
```bash
npm run build && npm run test:factory-line
```
This runs the plugin vitest suite plus a **full `CodeGraph.init` + `indexAll`**
over each mini-repo and asserts the route names — proving the plugin works
through the real pipeline, not just in isolation.

### Step 8 — Prove on a real repo + precision

Clone one of the Step-3 repos (shallow, into
`.har/artifacts/factory-line/repos/` or `/tmp/codegraph-corpus`), index it with
the dev build, and inspect:
```bash
( cd <repo> && codegraph init -i )   # after ./scripts/local-install.sh
node scripts/dump-graph.mjs <repo>   # or query .codegraph/ directly
sqlite3 <repo>/.codegraph/graph.db "select name from nodes where kind='route' order by name" | head -50
```
Judge three things:
- **Recall** — spot-check ~10 endpoints you know exist (from the repo's docs,
  OpenAPI spec, or reading its route files) and confirm each appears.
- **Precision** — read the full extracted route list for garbage: routes from
  comments/strings/tests, duplicated prefixes, malformed paths. Partial or
  wrong routes are worse than none.
- **No collateral damage** — total `select count(*) from nodes` on a **control
  repo** of the same language (one with no `<framework>`) must be unchanged vs.
  a build without your plugin, and `detect()` must not fire there.

If recall gaps trace back to a syntax you skipped in Step 2, go back and cover
it (or explicitly record it as a known gap with the reason).

### Step 9 — CHANGELOG

Add a bullet under `## [Unreleased]` → `### New Features` (create the section
if missing; never pre-create a version block). User-facing wording per house
rules — framework name yes, file paths and counts no. E.g.
*"CodeGraph now detects **Fastify** HTTP routes — including route plugins,
prefixed registration, and shorthand methods — so endpoint queries cover
Fastify services."*

### Step 10 — Report (do NOT commit)

Summarize for review:
- **Syntax inventory** from Step 2: each form, covered ✓ / known gap ✗ (with
  reason).
- **Files changed**: plugin dir, registry, tests + fixtures, factory-line case
  + manifest, CHANGELOG.
- **Proof**: vitest + factory-line results; real-repo route count with the
  recall spot-check and precision verdict; control-repo check.
- **Follow-ups**: uncovered syntaxes, route→handler resolution gaps, whether an
  explore-flow A/B (`/agent-eval`) is worth running.

Hand the changes to the user. **Do not** run `git commit`/`push`.

## Notes
- **Precision over recall when in doubt**: a `detect()` or route regex that
  misfires pollutes every repo of that language. Silent beats wrong (CLAUDE.md
  principle) — leave a dynamic/unresolvable registration form uncovered and
  report it rather than guessing paths.
- Use the exact `NodeKind`/`EdgeKind` strings from `src/types.ts`
  (`route`, `references`).
- Any change under `src/plugins/` that replaces a stock resolver in
  `src/resolution/frameworks/` should move logic **out** of the stock file only
  if needed, keeping the upstream-sync surface small (`src/plugins/README.md`).
- If the framework's routes cross a dynamic-dispatch boundary that breaks
  `codegraph_explore` flows (route → handler → service), note it as a
  follow-up per the dynamic-dispatch playbook
  (`docs/design/dynamic-dispatch-coverage-playbook.md`) — this skill's scope is
  endpoint *detection*, not flow synthesis.
