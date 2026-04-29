-- List NEED_REVIEW tasks with approve/reject links.
-- Replace http://localhost:5678 with your n8n base URL if needed.
SELECT
  id,
  title,
  status,
  video_path,
  cover_path,
  voice_path,
  updated_at,
  'http://localhost:5678/webhook/video-review-action?action=approve&task_id=' || id || '&token=' || review_token AS approve_url,
  'http://localhost:5678/webhook/video-review-action?action=reject&task_id=' || id || '&token=' || review_token AS reject_url
FROM video_topics
WHERE status = 'NEED_REVIEW'
ORDER BY updated_at DESC;
