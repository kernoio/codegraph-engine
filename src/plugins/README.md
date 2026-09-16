# In-repo Kerno framework plugins (no npm publish required)

## Layout

```
src/plugins/<id>/
  index.ts      — default-export CodeGraphPlugin
  resolver.ts   — FrameworkResolver implementation
```

## Always-on vs optional

Built-ins listed in `src/plugins/index.ts` are registered into
`FRAMEWORK_RESOLVERS` at module load (so parse workers see them) and also
exposed via `getBuiltInPlugins()` for the plugin lifecycle.

Optional plugins (future): list a relative path or package name in the
*analyzed project's* `codegraph.json`:

```json
{ "plugins": ["./path/to/my-plugin"] }
```

That package must default-export a `CodeGraphPlugin`. Prefer implementing
new detectors here under `src/plugins/` and adding them to
`getBuiltInPlugins()` so the Docker image ships them without npm.

## Sync with upstream

Keep detector logic out of `src/resolution/frameworks/{react,nestjs,go}.ts`
when a dedicated plugin can own it. Rebase upstream; re-apply only the
registration loop in `frameworks/index.ts` plus any remaining Nest/Go
hardenings until those become plugins too.

## Next.js App Router — page UI vs HTTP handlers (#8)

Stock upstream `nextjs` and `kerno-next-app-router` both emit `kind: route`
nodes for App Router layers, split so neither double-counts the other:

| Source | File | Handler form | `name` | SCIP endpoint totals? |
|--------|------|---------------|--------|----------------------|
| `nextjs` (stock) | `app/.../page.*` | — | `/dashboard` | No — UI navigation (Screens) |
| `nextjs` (stock) | `app/.../route.ts` | `export function GET` / `export const GET = …` | `GET /api/health` | Yes |
| `nextjs` (stock) | `pages/api/*` | `req.method === 'POST'` / `switch (method)` (default `GET`) | `POST /api/hello` | Yes |
| `kerno-next-app-router` | `app/.../route.ts` | `export { GET, POST } from '…'` (re-export) | `GET /api/health` | Yes |

`kerno-next-app-router` only owns the re-export form — a thin
`app/api/.../route.ts` that re-exports a real handler implemented elsewhere
(formbricks-style, e.g. `modules/.../route.ts`). Stock `nextjs` already reads
direct `function`/`const` handler exports, so widening this plugin back to
that form would double-count the route.

Implementation modules (`modules/**/route.ts`, formbricks-style) are **not**
indexed — only paths under an `app/` segment are, so re-export stubs are not
double-counted with their module implementations.

Endpoint / aicore consumers should filter with `isNextHttpRouteHandler()` from
`src/plugins/next-app-router/route-path.ts` rather than counting all route nodes.

## Remix / React Router framework mode

`kerno-remix` indexes framework-mode HTTP handlers (`loader` → `GET`, `action` →
`POST` / method-switch verbs) from `app/routes/**` file conventions and rewrites
paths from `app/routes.ts` (`route` / `index` / `prefix` / `layout`). Declarative
`<Route>` / `createBrowserRouter` data-router apps stay on the stock `react`
resolver.
