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
