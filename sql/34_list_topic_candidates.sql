-- Topic center list query.

WITH listed AS (
  SELECT
    false AS is_empty,
    tc.id,
    tc.source,
    tc.source_ref,
    tc.status,
    tc.topic,
    tc.title,
    tc.angle,
    tc.audience,
    tc.platform,
    tc.account_key,
    tc.category,
    tc.tags,
    tc.score,
    tc.score_reason,
    tc.duplicate_of,
    tc.promoted_topic_id,
    vt.status AS promoted_topic_status,
    vt.title AS promoted_topic_title,
    tc.created_at,
    tc.updated_at
  FROM topic_candidates tc
  LEFT JOIN video_topics vt ON vt.id = tc.promoted_topic_id
  ORDER BY tc.updated_at DESC, tc.created_at DESC
  LIMIT 300
)
SELECT * FROM listed
UNION ALL
SELECT
  true AS is_empty,
  NULL::uuid AS id,
  NULL::text AS source,
  NULL::text AS source_ref,
  NULL::text AS status,
  NULL::text AS topic,
  NULL::text AS title,
  NULL::text AS angle,
  NULL::text AS audience,
  NULL::text AS platform,
  NULL::text AS account_key,
  NULL::text AS category,
  '[]'::jsonb AS tags,
  NULL::numeric AS score,
  NULL::text AS score_reason,
  NULL::uuid AS duplicate_of,
  NULL::uuid AS promoted_topic_id,
  NULL::text AS promoted_topic_status,
  NULL::text AS promoted_topic_title,
  NULL::timestamptz AS created_at,
  NULL::timestamptz AS updated_at
WHERE NOT EXISTS (SELECT 1 FROM listed);
