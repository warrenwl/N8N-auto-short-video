SELECT
  id,
  video_topic_id,
  platform,
  status,
  title,
  video_url,
  cover_url,
  caption_url,
  metadata_url,
  reminded_at,
  published_at,
  created_at,
  updated_at
FROM video_publish_jobs
WHERE platform = 'douyin'
ORDER BY updated_at DESC NULLS LAST, created_at DESC
LIMIT 50;
