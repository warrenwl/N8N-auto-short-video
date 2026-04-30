-- Create one async GLM topic generation job.
-- $1 batch_id
-- $2 platform
-- $3 account_key
-- $4 category
-- $5 direction
-- $6 audience
-- $7 style
-- $8 requested_count
-- $9 prompt_messages_json
-- $10 llm_request_body_json

WITH upserted AS (
  INSERT INTO topic_generation_jobs (
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
    request_payload,
    created_at,
    updated_at
  )
  VALUES (
    $1,
    'glm',
    'RUNNING',
    COALESCE(NULLIF($2, ''), 'douyin'),
    COALESCE(NULLIF($3, ''), 'mes'),
    NULLIF($4, ''),
    NULLIF($5, ''),
    NULLIF($6, ''),
    NULLIF($7, ''),
    CASE
      WHEN NULLIF($8::text, '') ~ '^[0-9]+$' THEN NULLIF($8::text, '')::integer
      ELSE 1
    END,
    jsonb_build_object(
      'prompt_messages', COALESCE(NULLIF($9, '')::jsonb, '[]'::jsonb),
      'llm_request_body', COALESCE(NULLIF($10, '')::jsonb, '{}'::jsonb)
    ),
    NOW(),
    NOW()
  )
  ON CONFLICT (batch_id) DO UPDATE
  SET
    status = 'RUNNING',
    updated_at = NOW(),
    completed_at = NULL,
    error = NULL
  RETURNING *
)
SELECT
  true AS success,
  'TOPIC_GENERATION_JOB_STARTED'::text AS result_code,
  202 AS response_status_code,
  id AS generation_job_id,
  batch_id,
  'glm:' || batch_id AS source_ref,
  status,
  platform,
  account_key,
  category,
  direction,
  audience,
  style,
  requested_count AS count,
  $9 AS prompt_messages_json,
  $10::jsonb AS llm_request_body,
  request_payload,
  created_at,
  updated_at
FROM upserted;
