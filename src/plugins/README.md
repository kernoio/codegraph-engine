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

Stock `react` and `kerno-next-app-router` both emit `kind: route` nodes for
different App Router layers:

| Source | File | `name` | SCIP endpoint totals? |
|--------|------|--------|----------------------|
| `react` | `app/.../page.*` | `/dashboard` | No — UI navigation |
| `kerno-next-app-router` | `app/.../route.ts` | `GET /api/health` | Yes |

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
