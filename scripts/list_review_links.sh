#!/usr/bin/env bash
set -euo pipefail

N8N_BASE_URL="${N8N_BASE_URL:-http://localhost:5678}"
DB_CONTAINER="${DB_CONTAINER:-n8n-video-postgres}"
DB_USER="${DB_USER:-n8n}"
DB_NAME="${DB_NAME:-video_agent}"

SQL="SELECT
  id,
  title,
  status,
  video_path,
  '${N8N_BASE_URL}/webhook/video-review-action?action=approve&task_id=' || id || '&token=' || review_token AS approve_url,
  '${N8N_BASE_URL}/webhook/video-review-action?action=reject&task_id=' || id || '&token=' || review_token AS reject_url
FROM video_topics
WHERE status = 'NEED_REVIEW'
ORDER BY updated_at DESC;"

docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -c "$SQL"
