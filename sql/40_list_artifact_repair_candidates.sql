-- V4.1: list tasks that may have finished local artifacts but missed DB writeback.
-- n8n Postgres node: Execute Query

SELECT
  id,
  topic,
  title,
  status,
  review_token,
  cover_path,
  video_path,
  media_started_at,
  render_started_at,
  updated_at,
  EXTRACT(EPOCH FROM (
    now() - COALESCE(
      CASE
        WHEN status = 'GENERATING_COVER' THEN media_started_at::timestamptz
        WHEN status = 'RENDERING_VIDEO' THEN render_started_at::timestamptz
        ELSE NULL
      END,
      updated_at::timestamptz,
      created_at::timestamptz
    )
  ))::integer AS stale_seconds
FROM video_topics
WHERE auto_recovery_disabled = false
  AND review_token IS NOT NULL
  AND status IN ('GENERATING_COVER', 'RENDERING_VIDEO')
  AND EXTRACT(EPOCH FROM (
    now() - COALESCE(
      CASE
        WHEN status = 'GENERATING_COVER' THEN media_started_at::timestamptz
        WHEN status = 'RENDERING_VIDEO' THEN render_started_at::timestamptz
        ELSE NULL
      END,
      updated_at::timestamptz,
      created_at::timestamptz
    )
  )) >= 60
ORDER BY updated_at ASC
LIMIT 10;
