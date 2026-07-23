#!/usr/bin/env bash
# Endpoint detection e2e across fixture repos
# Custom HAR stage: factory-line (kind: test)
#
# Stage script contract (full reference: .har/STAGES.md):
#   - stdout: a single JSON result object (status, stageId, agent_id, ...)
#   - stderr: human-readable progress
#   - $1: agent slot id; extra args may follow
#   - artifacts: write reports/screenshots/logs under .har/artifacts/factory-line/
#   - exit code: the real status (0 = pass)
#
# Usage: ./.har/stages/factory-line.sh <agent-id> [extra args...]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HARNESS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$HARNESS_DIR/.." && pwd)"

# shellcheck source=/dev/null
source "$HARNESS_DIR/harness.env"
# shellcheck source=/dev/null
source "$HARNESS_DIR/agent-slot.sh"

AGENT_ID="${1:?Usage: factory-line.sh <agent-id> [extra args...]}"
validate_agent_id "$AGENT_ID"

ENV_FILE="$(resolve_agent_env_file "$AGENT_ID" "$REPO_ROOT")" || {
  echo "No .env.agent.${AGENT_ID} found. Run: ./.har/launch.sh ${AGENT_ID}" >&2
  exit 1
}
set -a
# shellcheck source=/dev/null
source "$ENV_FILE"
set +a

WORK_DIR="$(resolve_agent_work_dir "$ENV_FILE")"
ARTIFACTS_DIR="$HARNESS_DIR/artifacts/factory-line"
mkdir -p "$ARTIFACTS_DIR"

echo "==> [factory-line agent-${AGENT_ID}] running in ${WORK_DIR}" >&2
START=$(now_ms)

# Endpoint detection factory line: plugin vitest + mini-repo full-index cases.
# Optional OSS clones: FACTORY_LINE_CLONE=1 or pass --clone-repos to run.mjs.
#
# Always prefer the session worktree's run.mjs. `har env verify` invokes this
# script from the main-checkout .har/, so $HARNESS_DIR points at main while
# $WORK_DIR is the worktree — running the main copy made vitest/build hit the
# wrong tree (run.mjs resolves REPO_ROOT from __dirname / cwd).
FACTORY_LINE_RUNNER="${WORK_DIR}/.har/factory-line/run.mjs"
if [ ! -f "${FACTORY_LINE_RUNNER}" ]; then
  FACTORY_LINE_RUNNER="${HARNESS_DIR}/factory-line/run.mjs"
fi

set +e
OUTPUT=$(
  cd "$WORK_DIR" && \
  FACTORY_LINE_ARTIFACTS="$ARTIFACTS_DIR" \
  FACTORY_LINE_REPO_ROOT="$WORK_DIR" \
  "${NODE_BIN:-node}" "${FACTORY_LINE_RUNNER}" 2>&1
)
EXIT_CODE=$?
set -e

printf '%s\n' "$OUTPUT" > "$ARTIFACTS_DIR/last-run.log"

END=$(now_ms)
STATUS="fail"
[ "$EXIT_CODE" = "0" ] && STATUS="pass"
OUTPUT_JSON=$(escape_step_output "$OUTPUT")

node -e "process.stdout.write(JSON.stringify({
  status: '$STATUS',
  stageId: 'factory-line',
  kind: 'test',
  agent_id: $AGENT_ID,
  total_ms: $(( END - START )),
  output: $OUTPUT_JSON
}, null, 2) + '\n');"

exit "$EXIT_CODE"
