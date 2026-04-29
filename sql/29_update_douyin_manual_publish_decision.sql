-- User clicked "published" or "skip" from the reminder link.
-- $1 action_result: MANUAL_PUBLISHED or MANUAL_SKIPPED
-- $2 note
-- $3 published_url
-- $4 job_id
-- $5 manual_confirm_token

WITH updated_job AS (
  UPDATE video_publish_jobs
  SET
    status = $1,
    manual_publish_note = NULLIF($2, ''),
    published_url = NULLIF($3, ''),
    published_at = CASE WHEN $1 = 'MANUAL_PUBLISHED' THEN NOW() ELSE published_at END,
    updated_at = NOW()
  WHERE id = $4::bigint
    AND manual_confirm_token = $5
    AND status IN ('REMIND_SENT', 'PACKAGE_READY', 'REMINDING')
  RETURNING *
), updated_topic AS (
  UPDATE video_topics vt
  SET
    status = CASE
      WHEN (SELECT status FROM updated_job) = 'MANUAL_PUBLISHED' THEN 'PUBLISHED'
      ELSE 'APPROVED'
    END,
    publish_status = (SELECT status FROM updated_job),
    publish_url = CASE
      WHEN (SELECT status FROM updated_job) = 'MANUAL_PUBLISHED' THEN COALESCE(NULLIF((SELECT published_url FROM updated_job), ''), publish_url)
      ELSE publish_url
    END,
    published_manually_at = CASE
      WHEN (SELECT status FROM updated_job) = 'MANUAL_PUBLISHED' THEN NOW()
      ELSE published_manually_at
    END,
    updated_at = NOW()
  FROM updated_job uj
  WHERE vt.id = uj.video_topic_id
  RETURNING vt.id, vt.status AS topic_status
)
SELECT
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
  updated_job.updated_at,
  (SELECT topic_status FROM updated_topic LIMIT 1) AS topic_status,
  true AS success,
  'UPDATED'::text AS result_code
FROM updated_job
UNION ALL
SELECT
  NULL::bigint AS id,
  NULL::uuid AS video_topic_id,
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
  NULL::timestamptz AS updated_at,
  NULL::text AS topic_status,
  false AS success,
  'INVALID_JOB_OR_TOKEN'::text AS result_code
WHERE NOT EXISTS (SELECT 1 FROM updated_job);
