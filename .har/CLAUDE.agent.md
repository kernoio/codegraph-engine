# Agent ${AGENT_ID} — CodeGraph engine

> [`AGENT.md`](../AGENT.md) · [`.har/README.md`](./README.md) · [`.har/factory-line/manifest.json`](./factory-line/manifest.json)

## Environment

| | |
|--|--|
| **Agent ID** | ${AGENT_ID} |
| **Work dir** | Session git worktree — see launch output or `.har/slots/agent-${AGENT_ID}.json` |
| **Stack** | Node ≥20, npm, vitest, TypeScript CLI (`codegraph`) |

**Never edit the main checkout.** Launch first; edit only under the work dir.

```bash
./.har/agent-cli.sh ${AGENT_ID} status
```

## Project commands

```bash
npm run build          # tsc + copy wasm/schema
npm test               # full vitest suite
node .har/factory-line/run.mjs   # endpoint detection factory line
```

## Factory line (endpoint detection e2e)

The `factory-line` stage validates route/endpoint detectors across:

1. **Plugin vitest** — `__tests__/plugins/` (tsoa, Next App Router)
2. **Mini-repo cases** — `.har/factory-line/cases/*` indexed end-to-end via `CodeGraph.indexAll()`
3. **Optional OSS clones** — set `FACTORY_LINE_CLONE=1` or pass `--clone-repos` to `run.mjs`

Add a new detector case:

```
.har/factory-line/cases/<id>/
  expected.json     # { "framework": "...", "routes": ["GET /path", ...] }
  files/            # minimal repo tree for the detector
```

Register `<id>` in `.har/factory-line/manifest.json` → `miniRepos`.

## Definition of done

- [ ] `har env verify ${AGENT_ID} --full` returns `"status": "pass"`
- [ ] New detectors include a factory-line case + plugin test
- [ ] Committed in the session worktree; finish with `har env complete ${AGENT_ID}`

## Do not

- Work around failing harness commands with ad-hoc setup
- Edit `.env.agent.${AGENT_ID}` by hand
- Edit the main checkout
