WITH picked AS (
  SELECT id
  FROM video_topics
  WHERE status = 'SCRIPT_READY'
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED
)
UPDATE video_topics AS vt
SET
  status = 'RENDERING',
  media_started_at = CURRENT_TIMESTAMP,
  render_started_at = CURRENT_TIMESTAMP,
  audio_started_at = CURRENT_TIMESTAMP,
  updated_at = CURRENT_TIMESTAMP,
  error = NULL
FROM picked
WHERE vt.id = picked.id
RETURNING vt.*;
