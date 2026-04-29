-- Start or reuse a douyin semi-auto publishing job for one APPROVED video.
-- Query parameters:
-- $1 = video topic id
-- $2 = review token

WITH topic AS (
  SELECT *
  FROM video_topics
  WHERE id = $1::uuid
    AND review_token = $2
  LIMIT 1
), reusable_job AS (
  SELECT j.*
  FROM video_publish_jobs j
  JOIN topic t ON t.id = j.video_topic_id
  WHERE j.platform = 'douyin'
    AND j.status IN ('PACKAGING', 'PACKAGE_READY', 'REMINDING', 'REMIND_SENT')
  ORDER BY j.updated_at DESC
  LIMIT 1
), inserted_job AS (
  INSERT INTO video_publish_jobs (
    video_topic_id,
    platform,
    status,
    title,
    caption,
    hashtags,
    video_path,
    cover_path,
    manual_confirm_token,
    created_at,
    updated_at
  )
  SELECT
    t.id,
    'douyin',
    'PACKAGING',
    COALESCE(NULLIF(t.title, ''), NULLIF(t.topic, ''), '待发布视频'),
    trim(
      both E'\n' FROM
      COALESCE(NULLIF(t.title, ''), NULLIF(t.topic, ''), '待发布视频')
      || E'\n\n'
      || COALESCE((
        SELECT string_agg(
          CASE
            WHEN tag_text LIKE '#%' THEN tag_text
            ELSE '#' || tag_text
          END,
          ' '
        )
        FROM (
          SELECT trim(both '"' FROM value::text) AS tag_text
          FROM jsonb_array_elements(COALESCE(t.hashtags, '[]'::jsonb)) AS value
        ) tags
        WHERE tag_text <> ''
      ), '')
    ),
    COALESCE((
      SELECT string_agg(
        CASE
          WHEN tag_text LIKE '#%' THEN tag_text
          ELSE '#' || tag_text
        END,
        ' '
      )
      FROM (
        SELECT trim(both '"' FROM value::text) AS tag_text
        FROM jsonb_array_elements(COALESCE(t.hashtags, '[]'::jsonb)) AS value
      ) tags
      WHERE tag_text <> ''
    ), ''),
    t.video_path,
    t.cover_path,
    md5(random()::text || clock_timestamp()::text || t.id::text),
    NOW(),
    NOW()
  FROM topic t
  WHERE t.status = 'APPROVED'
    AND lower(COALESCE(t.platform, 'douyin')) IN ('douyin', '抖音')
    AND NULLIF(t.video_path, '') IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM reusable_job)
  ON CONFLICT DO NOTHING
  RETURNING *
), picked AS (
  SELECT * FROM reusable_job
  UNION ALL
  SELECT * FROM inserted_job
  LIMIT 1
), topic_update AS (
  UPDATE video_topics vt
  SET
    publish_status = CASE
      WHEN p.status = 'REMIND_SENT' THEN 'REMIND_SENT'
      WHEN p.status = 'PACKAGE_READY' THEN 'PACKAGE_READY'
      ELSE 'PACKAGING_DOUYIN'
    END,
    updated_at = NOW()
  FROM picked p
  WHERE vt.id = p.video_topic_id
  RETURNING vt.id
), existing_topic AS (
  SELECT
    false AS success,
    CASE
      WHEN NOT EXISTS (SELECT 1 FROM topic) THEN 'INVALID_TASK_OR_TOKEN'
      WHEN (SELECT status FROM topic) <> 'APPROVED' THEN 'INVALID_SOURCE_STATUS'
      WHEN lower(COALESCE((SELECT platform FROM topic), 'douyin')) NOT IN ('douyin', '抖音') THEN 'INVALID_PLATFORM'
      WHEN NULLIF((SELECT video_path FROM topic), '') IS NULL THEN 'MISSING_VIDEO_PATH'
      ELSE 'NOT_CREATED'
    END AS result_code,
    NULL::bigint AS id,
    (SELECT id FROM topic) AS video_topic_id,
    'douyin'::text AS platform,
    NULL::text AS status,
    (SELECT title FROM topic) AS title,
    NULL::text AS caption,
    NULL::text AS hashtags,
    (SELECT video_path FROM topic) AS video_path,
    (SELECT cover_path FROM topic) AS cover_path,
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
)
SELECT
  true AS success,
  CASE WHEN status = 'PACKAGING' THEN 'JOB_READY_FOR_PACKAGING' ELSE 'JOB_ALREADY_EXISTS' END AS result_code,
  picked.id,
  picked.video_topic_id,
  picked.platform,
  picked.status,
  picked.title,
  picked.caption,
  picked.hashtags,
  picked.video_path,
  picked.cover_path,
  picked.package_dir,
  picked.video_url,
  picked.cover_url,
  picked.caption_url,
  picked.metadata_url,
  picked.download_page_url,
  picked.video_download_url,
  picked.manual_confirm_token,
  picked.remind_channel,
  picked.remind_status,
  picked.remind_message,
  picked.remind_response,
  picked.reminded_at,
  picked.manual_publish_note,
  picked.published_url,
  picked.published_at,
  picked.error_code,
  picked.error_message,
  picked.created_at,
  picked.updated_at
FROM picked
UNION ALL
SELECT * FROM existing_topic
WHERE NOT EXISTS (SELECT 1 FROM picked);
