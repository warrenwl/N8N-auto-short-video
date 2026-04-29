-- ServerChan reminder was sent or skipped.
-- $1 remind_status
-- $2 remind_message
-- $3 remind_response json
-- $4 job_id

WITH updated_job AS (
  UPDATE video_publish_jobs
  SET
    status = 'REMIND_SENT',
    remind_channel = 'serverchan',
    remind_status = $1,
    remind_message = NULLIF(convert_from(decode($2, 'base64'), 'UTF8'), ''),
    remind_response = COALESCE(NULLIF($3, '')::jsonb, '{}'::jsonb),
    reminded_at = NOW(),
    updated_at = NOW()
WHERE id = $4::bigint
    AND status IN ('PACKAGE_READY', 'REMINDING', 'REMIND_SENT')
  RETURNING *
), updated_topic AS (
  UPDATE video_topics vt
  SET
    publish_status = 'REMIND_SENT',
    updated_at = NOW()
  FROM updated_job uj
  WHERE vt.id = uj.video_topic_id
  RETURNING vt.id
)
SELECT * FROM updated_job;
