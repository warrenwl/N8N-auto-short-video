-- Withdraw an active douyin publish job and keep the video in APPROVED.
-- $1 = video topic id
-- $2 = review token

WITH topic AS (
  SELECT *
  FROM video_topics
  WHERE id = $1::uuid
    AND review_token = $2
  LIMIT 1
), picked_job AS (
  SELECT j.*
  FROM video_publish_jobs j
  JOIN topic t ON t.id = j.video_topic_id
  WHERE j.platform = 'douyin'
    AND j.status IN ('PACKAGING', 'PACKAGE_READY', 'REMINDING', 'REMIND_SENT')
  ORDER BY j.updated_at DESC
  LIMIT 1
), updated_job AS (
  UPDATE video_publish_jobs j
  SET
    status = 'MANUAL_SKIPPED',
    manual_publish_note = '审核中心撤回发布',
    updated_at = NOW()
  FROM picked_job p
  WHERE j.id = p.id
  RETURNING j.*
), updated_topic AS (
  UPDATE video_topics vt
  SET
    status = 'APPROVED',
    publish_status = NULL,
    updated_at = NOW()
  FROM topic t
  WHERE vt.id = t.id
    AND EXISTS (SELECT 1 FROM updated_job)
  RETURNING vt.id
)
SELECT
  true AS success,
  'WITHDRAWN'::text AS result_code,
  updated_job.id,
  updated_job.video_topic_id,
  updated_job.platform,
  updated_job.status,
  updated_job.title,
  updated_job.caption,
  updated_job.hashtags,
  updated_job.video_path,
  updated_job.cover_path,
  updated_job.package_dir,
  updated_job.video_url,
  updated_job.cover_url,
  updated_job.caption_url,
  updated_job.metadata_url,
  updated_job.download_page_url,
  updated_job.video_download_url,
  updated_job.manual_confirm_token,
  updated_job.remind_channel,
  updated_job.remind_status,
  updated_job.remind_message,
  updated_job.remind_response,
  updated_job.reminded_at,
  updated_job.manual_publish_note,
  updated_job.published_url,
  updated_job.published_at,
  updated_job.error_code,
  updated_job.error_message,
  updated_job.created_at,
  updated_job.updated_at
FROM updated_job
UNION ALL
SELECT
  false AS success,
  CASE
    WHEN NOT EXISTS (SELECT 1 FROM topic) THEN 'INVALID_TASK_OR_TOKEN'
    WHEN NOT EXISTS (SELECT 1 FROM picked_job) THEN 'NO_ACTIVE_PUBLISH_JOB'
    ELSE 'NOT_UPDATED'
  END AS result_code,
  NULL::bigint AS id,
  (SELECT id FROM topic) AS video_topic_id,
  'douyin'::text AS platform,
  NULL::text AS status,
  NULL::text AS title,
  NULL::text AS caption,
  NULL::text AS hashtags,
  NULL::text AS video_path,
  NULL::text AS cover_path,
  NULL::text AS package_dir,
  NULL::text AS video_url,
  NULL::text AS cover_url,
  NULL::text AS caption_url,
  NULL::text AS metadata_url,
  NULL::text AS download_page_url,
  NULL::text AS video_download_url,
  NULL::text AS manual_confirm_token,
  NULL::text AS remind_channel,
  NULL::text AS remind_status,
  NULL::text AS remind_message,
  NULL::jsonb AS remind_response,
  NULL::timestamptz AS reminded_at,
  NULL::text AS manual_publish_note,
  NULL::text AS published_url,
  NULL::timestamptz AS published_at,
  NULL::text AS error_code,
  NULL::text AS error_message,
  NULL::timestamptz AS created_at,
  NULL::timestamptz AS updated_at
WHERE NOT EXISTS (SELECT 1 FROM updated_job);
