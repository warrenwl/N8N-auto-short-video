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
    tc.raw_payload->'raw_candidate'->>'core_angle' AS core_angle,
    tc.raw_payload->'raw_candidate'->>'pain_point' AS pain_point,
    tc.raw_payload->'raw_candidate'->>'promise' AS promise,
    tc.raw_payload->'raw_candidate'->>'opening_hook' AS opening_hook,
    tc.raw_payload->'raw_candidate'->>'risk_note' AS risk_note,
    COALESCE(NULLIF(tc.raw_payload->'raw_candidate'->>'score_reason', ''), tc.score_reason) AS candidate_score_reason,
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
    vt.review_token AS promoted_topic_review_token,
    CASE vt.status
      WHEN 'GENERATING_SCRIPT' THEN 10
      WHEN 'SCRIPT_READY' THEN 15
      WHEN 'MEDIA_READY' THEN 8
      WHEN 'GENERATING_AUDIO' THEN 20
      WHEN 'AUDIO_READY' THEN 35
      WHEN 'GENERATING_COVER' THEN 45
      WHEN 'COVER_READY' THEN 60
      WHEN 'RENDERING_VIDEO' THEN 80
      WHEN 'NEED_REVIEW' THEN 100
      WHEN 'FAILED' THEN 100
      WHEN 'RENDER_FAILED' THEN 100
      ELSE NULL
    END AS promoted_topic_progress_percent,
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
  NULL::text AS core_angle,
  NULL::text AS pain_point,
  NULL::text AS promise,
  NULL::text AS opening_hook,
  NULL::text AS risk_note,
  NULL::text AS candidate_score_reason,
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
  NULL::text AS promoted_topic_review_token,
  NULL::integer AS promoted_topic_progress_percent,
  NULL::timestamptz AS created_at,
  NULL::timestamptz AS updated_at
WHERE NOT EXISTS (SELECT 1 FROM listed);
