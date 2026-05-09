#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-n8n-video-postgres}"
POSTGRES_USER="${POSTGRES_USER:-n8n}"
POSTGRES_DB="${POSTGRES_DB:-video_agent}"

psql_cmd() {
  docker exec -i "$POSTGRES_CONTAINER" psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"
}

if [[ "${1:-}" != "--skip-migrations" ]]; then
  psql_cmd < sql/47_novel_schema.sql
  psql_cmd < sql/48_novel_functions.sql
fi

psql_cmd < sql/62_novel_review_assistant_tdd.sql
