-- List recent async GLM topic generation jobs for the topic center.
-- Also closes obviously stale RUNNING jobs so the UI does not show them forever
-- when a background branch fails before the success updater runs.

WITH stale AS (
  UPDATE topic_generation_jobs
  SET
    status = 'FAILED',
    error = 'GLM 候选生成超过 5 分钟未完成，已自动标记失败；请重试或减少生成数量。',
    updated_at = NOW(),
    completed_at = NOW()
  WHERE status = 'RUNNING'
    AND created_at < NOW() - INTERVAL '5 minutes'
  RETURNING id
)

SELECT
  id,
  batch_id,
  source,
  status,
  platform,
  account_key,
  category,
  direction,
  audience,
  style,
  requested_count,
  parsed_count,
  created_count,
  duplicate_count,
  created_candidates,
  error,
  created_at,
  updated_at,
  completed_at,
  (SELECT count(*) FROM stale) AS stale_closed_count,
  EXTRACT(EPOCH FROM (COALESCE(completed_at, NOW()) - created_at))::integer AS elapsed_seconds
FROM topic_generation_jobs
ORDER BY created_at DESC
LIMIT 20;
