-- Create one topic candidate from the topic center form.
-- $1 source
-- $2 source_ref
-- $3 topic
-- $4 title
-- $5 angle
-- $6 audience
-- $7 platform
-- $8 account_key
-- $9 category
-- $10 tags_json
-- $11 raw_payload_json

WITH input AS (
  SELECT
    COALESCE(NULLIF($1, ''), 'manual') AS source,
    NULLIF($2, '') AS source_ref,
    trim($3) AS topic,
    NULLIF(trim($4), '') AS title,
    NULLIF(trim($5), '') AS angle,
    NULLIF(trim($6), '') AS audience,
    COALESCE(NULLIF(trim($7), ''), 'douyin') AS platform,
    COALESCE(NULLIF(trim($8), ''), 'mes') AS account_key,
    NULLIF(trim($9), '') AS category,
    COALESCE(NULLIF($10, '')::jsonb, '[]'::jsonb) AS tags,
    COALESCE(NULLIF($11, '')::jsonb, '{}'::jsonb) AS raw_payload
), existing AS (
  SELECT tc.*
  FROM topic_candidates tc
  JOIN input i ON true
  WHERE lower(regexp_replace(tc.topic, '\s+', '', 'g')) = lower(regexp_replace(i.topic, '\s+', '', 'g'))
    AND COALESCE(tc.account_key, '') = COALESCE(i.account_key, '')
    AND tc.status IN ('NEW', 'SCORED', 'SELECTED', 'PROMOTED')
  ORDER BY tc.updated_at DESC
  LIMIT 1
), inserted AS (
  INSERT INTO topic_candidates (
    source,
    source_ref,
    status,
    topic,
    title,
    angle,
    audience,
    platform,
    account_key,
    category,
    tags,
    raw_payload,
    created_at,
    updated_at
  )
  SELECT
    source,
    source_ref,
    'NEW',
    topic,
    title,
    angle,
    audience,
    platform,
    account_key,
    category,
    tags,
    raw_payload,
    NOW(),
    NOW()
  FROM input
  WHERE topic <> ''
    AND NOT EXISTS (SELECT 1 FROM existing)
  RETURNING *
)
SELECT
  true AS success,
  'CREATED'::text AS result_code,
  200 AS response_status_code,
  inserted.*
FROM inserted
UNION ALL
SELECT
  false AS success,
  CASE
    WHEN (SELECT topic FROM input) = '' THEN 'EMPTY_TOPIC'
    ELSE 'DUPLICATE_CANDIDATE'
  END AS result_code,
  409 AS response_status_code,
  COALESCE(existing.id, NULL::uuid) AS id,
  COALESCE(existing.source, (SELECT source FROM input)) AS source,
  existing.source_ref,
  COALESCE(existing.status, 'DUPLICATE') AS status,
  COALESCE(existing.topic, (SELECT topic FROM input)) AS topic,
  existing.title,
  existing.angle,
  existing.audience,
  COALESCE(existing.platform, (SELECT platform FROM input)) AS platform,
  COALESCE(existing.account_key, (SELECT account_key FROM input)) AS account_key,
  existing.category,
  COALESCE(existing.tags, '[]'::jsonb) AS tags,
  existing.score,
  existing.score_reason,
  existing.duplicate_of,
  existing.promoted_topic_id,
  existing.raw_payload,
  existing.created_at,
  existing.updated_at
FROM existing
RIGHT JOIN input ON true
WHERE NOT EXISTS (SELECT 1 FROM inserted);
