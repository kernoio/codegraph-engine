# Agent ${AGENT_ID} — CodeGraph engine

> [`AGENT.md`](../AGENT.md) · [`.har/README.md`](./README.md) · [`.har/factory-line/manifest.json`](./factory-line/manifest.json) · [`stages.json`](./stages.json)

## Environment

| | |
|--|--|
| **Agent ID** | ${AGENT_ID} |
| **Work dir** | Fresh session worktree per launch — see launch output or `.har/slots/agent-${AGENT_ID}.json` |
| **Stack** | Node ≥20, npm, vitest, TypeScript CLI (`codegraph`) |

**Never edit the main checkout** — launch FIRST, then make ALL file edits under the work dir from the launch output. Relaunching replaces the session (branch kept) and requires explicit confirmation (`--replace` / `confirmReplace`); dirty worktrees also need `--force` after user approval — never autonomously.

```bash
./.har/agent-cli.sh ${AGENT_ID} status
```

## Project commands

```bash
npm run build          # tsc + copy wasm/schema
npm test               # full vitest suite
npm run test:factory-line   # endpoint detection factory line
node .har/factory-line/run.mjs
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

- [ ] Full verification returns `"status": "pass"` (`har env verify ${AGENT_ID} --full`, MCP `har_run_verification` with `full: true`, or `./.har/verify.sh ${AGENT_ID} --full`)
- [ ] New detectors include a factory-line case + plugin test
- [ ] Changes committed **in the session worktree** with a clear message
- [ ] Finish with `har env complete ${AGENT_ID}` (or MCP `har_complete_environment`) — records the validation and tears down while **keeping the session branch** for the user to push / open a PR

Quick loop: MCP `har_run_verification`, `har env verify ${AGENT_ID}`, or `./.har/verify.sh ${AGENT_ID}`

Stages are the harness's single vocabulary for checks — interact only through `.har/stages.json` (`har_run_stage`, `verify`). Authoring guide: `.har/STAGES.md`.

## Do not

- Work around a failing harness command with ad-hoc setup — fix the harness or report the failure
- Edit `.env.agent.${AGENT_ID}` by hand
- Edit the main checkout — all edits go under the session work dir
