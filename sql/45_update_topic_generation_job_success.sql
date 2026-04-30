-- Mark async GLM topic generation job as succeeded.
-- $1 batch_id
-- $2 parsed_count
-- $3 created_count
-- $4 duplicate_count
-- $5 created_candidates_json

UPDATE topic_generation_jobs
SET
  status = 'SUCCEEDED',
  parsed_count = COALESCE(NULLIF($2, '')::integer, 0),
  created_count = COALESCE(NULLIF($3, '')::integer, 0),
  duplicate_count = COALESCE(NULLIF($4, '')::integer, 0),
  created_candidates = COALESCE(NULLIF($5, '')::jsonb, '[]'::jsonb),
  error = NULL,
  updated_at = NOW(),
  completed_at = NOW()
WHERE batch_id = $1
RETURNING
  true AS success,
  'TOPIC_GENERATION_JOB_SUCCEEDED'::text AS result_code,
  200 AS response_status_code,
  *;
