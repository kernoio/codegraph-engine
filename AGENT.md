# CodeGraph engine — agent harness

This repository uses [HAR](https://harproject.cloud/) (`.har/`) for isolated agent
worktrees, verification, and the **endpoint detection factory line**.

| Doc | Purpose |
|-----|---------|
| [`.har/README.md`](.har/README.md) | Full harness index |
| [`.har/CLAUDE.agent.md`](.har/CLAUDE.agent.md) | Per-slot agent instructions |
| [`.har/factory-line/manifest.json`](.har/factory-line/manifest.json) | Mini-repo + optional OSS clone cases |

## Preferred commands

```bash
har env launch 1
har env verify 1              # quick: npm run build
har env verify 1 --full       # + vitest + factory-line endpoint e2e
har env teardown 1
```

Run the factory line directly (after `npm run build`):

```bash
node .har/factory-line/run.mjs
FACTORY_LINE_CLONE=1 node .har/factory-line/run.mjs   # + shallow OSS repo clones
```

Shell fallback when the CLI is not installed: `./.har/launch.sh 1`, `./.har/verify.sh 1 --full`.

## Run history

| Entry point | Writes `.har/runs/`? |
|-------------|------------------------|
| `./.har/*.sh` | No |
| `har env …` / MCP | Yes — main checkout `.har/runs/YYYY-MM-DD/` |

With worktree slots, code runs in the worktree; run JSON lives in the main repo `.har/runs/`.

## Definition of done (Kerno detectors)

- `har env verify 1 --full` passes (includes `factory-line` stage)
- New framework detectors add a case under `.har/factory-line/cases/<id>/` and list it in `manifest.json`
- Changes committed in the **session worktree**, not the main checkout
