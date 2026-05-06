#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

N8N_CONTAINER="${N8N_CONTAINER:-n8n-video-n8n}"
DISABLE_SERVERCHAN="true"
DRY_RUN="false"

usage() {
  cat <<'USAGE'
Usage: scripts/run_novel_queue_once.sh [--dry-run] [--real-notify]

Runs one novel queue pass with the real GLM endpoint from .env:
  12 GENERATE_BIBLE
  13 GENERATE_OUTLINE
  13B PLAN_CHAPTER_DIRECTOR
  14 GENERATE_CHAPTER
  15 REVIEW_CHAPTER
  17 REWRITE_CHAPTER + NOTIFY_REVIEW
  18 auto recovery

Default notification mode is safe for smoke tests:
  NOVEL_DISABLE_SERVERCHAN=true

Use --real-notify only when you intentionally want ServerChan messages to be sent.
Do not set GLM_API_BASE_URL to the local mock endpoint for real runs.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN="true"
      shift
      ;;
    --real-notify)
      DISABLE_SERVERCHAN="false"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

run_cmd() {
  if [[ "$DRY_RUN" == "true" ]]; then
    printf '%q ' "$@"
    printf '\n'
    return
  fi
  "$@"
}

execute_workflow() {
  local workflow_id="$1"
  shift || true
  run_cmd docker compose run --rm "$@" n8n execute --id="$workflow_id" --rawOutput
}

restart_n8n() {
  if [[ "$DRY_RUN" == "true" ]]; then
    printf '%q ' docker start "$N8N_CONTAINER"
    printf '\n'
    return
  fi
  docker start "$N8N_CONTAINER" >/dev/null || true
}

if [[ "$DRY_RUN" == "true" ]]; then
  printf '%q ' docker stop "$N8N_CONTAINER"
  printf '\n'
else
  docker stop "$N8N_CONTAINER" >/dev/null
fi

trap restart_n8n EXIT

execute_workflow novelBibleV1Workflow12
execute_workflow novelOutlineV1Workflow13
execute_workflow novelDirectorV1Workflow13B
execute_workflow novelChapterV1Workflow14
execute_workflow novelAiReviewV1Workflow15

if [[ "$DISABLE_SERVERCHAN" == "true" ]]; then
  execute_workflow novelRewriteNotifyV1Workflow17 -e NOVEL_DISABLE_SERVERCHAN=true
else
  execute_workflow novelRewriteNotifyV1Workflow17
fi

execute_workflow novelAutoRecoveryV1Workflow18
