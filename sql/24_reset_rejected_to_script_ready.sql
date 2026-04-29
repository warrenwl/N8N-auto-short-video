-- Optional helper: send a rejected task back to SCRIPT_READY for re-rendering.
-- Replace the task id before running.
UPDATE video_topics
SET
  status = 'SCRIPT_READY',
  review_status = NULL,
  review_note = NULL,
  reviewed_at = NULL,
  rejected_at = NULL,
  updated_at = now()
WHERE id = 'REPLACE_TASK_ID'
  AND status = 'REJECTED';
