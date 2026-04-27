UPDATE video_topics
SET
  status = 'FAILED',
  error = $1,
  updated_at = CURRENT_TIMESTAMP
WHERE id = $2
RETURNING id, status, error;
