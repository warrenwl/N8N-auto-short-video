-- Topic candidate actions from topic center.
-- $1 action: promote, reject, duplicate
-- $2 candidate_id
-- $3 note

WITH candidate AS (
  SELECT *
  FROM topic_candidates
  WHERE id = $2::uuid
  LIMIT 1
), duplicate_target AS (
  SELECT other.id
  FROM topic_candidates other
  JOIN candidate c ON true
  WHERE other.id <> c.id
    AND lower(regexp_replace(other.topic, '\s+', '', 'g')) = lower(regexp_replace(c.topic, '\s+', '', 'g'))
    AND other.status IN ('NEW', 'SCORED', 'SELECTED', 'PROMOTED')
  ORDER BY other.updated_at DESC
  LIMIT 1
), promoted AS (
  INSERT INTO video_topics (
    topic,
    platform,
    style,
    duration_seconds,
    language,
    target_audience,
    status,
    title,
    hashtags,
    review_token,
    source_candidate_id,
    source,
    account_key,
    created_at,
    updated_at
  )
  SELECT
    c.topic,
    COALESCE(NULLIF(c.platform, ''), 'douyin'),
    '口播科普',
    60,
    'zh-CN',
    COALESCE(NULLIF(c.audience, ''), '普通短视频用户'),
    'IDEA',
    NULLIF(c.title, ''),
    COALESCE(c.tags, '[]'::jsonb),
    md5(random()::text || clock_timestamp()::text || c.id::text),
    c.id,
    c.source,
    c.account_key,
    NOW(),
    NOW()
  FROM candidate c
  WHERE $1 = 'promote'
    AND c.status IN ('NEW', 'SCORED', 'SELECTED')
    AND NOT EXISTS (
      SELECT 1
      FROM video_topics vt
      WHERE lower(regexp_replace(vt.topic, '\s+', '', 'g')) = lower(regexp_replace(c.topic, '\s+', '', 'g'))
        AND COALESCE(vt.account_key, '') = COALESCE(c.account_key, '')
        AND vt.status IN ('IDEA', 'GENERATING_SCRIPT', 'SCRIPT_READY', 'NEED_REVIEW', 'APPROVED', 'PUBLISHED')
    )
  RETURNING *
), updated_candidate AS (
  UPDATE topic_candidates tc
  SET
    status = CASE
      WHEN $1 = 'promote' AND EXISTS (SELECT 1 FROM promoted) THEN 'PROMOTED'
      WHEN $1 = 'reject' THEN 'REJECTED'
      WHEN $1 = 'duplicate' THEN 'DUPLICATE'
      ELSE tc.status
    END,
    promoted_topic_id = CASE
      WHEN $1 = 'promote' AND EXISTS (SELECT 1 FROM promoted) THEN (SELECT id FROM promoted LIMIT 1)
      ELSE promoted_topic_id
    END,
    duplicate_of = CASE
      WHEN $1 = 'duplicate' THEN (SELECT id FROM duplicate_target LIMIT 1)
      ELSE duplicate_of
    END,
    score_reason = CASE
      WHEN NULLIF($3, '') IS NOT NULL THEN concat_ws(E'\n', score_reason, $3)
      ELSE score_reason
    END,
    updated_at = NOW()
  WHERE tc.id = $2::uuid
    AND (
      ($1 = 'promote' AND EXISTS (SELECT 1 FROM promoted))
      OR ($1 = 'reject' AND tc.status IN ('NEW', 'SCORED', 'SELECTED'))
      OR ($1 = 'duplicate' AND tc.status IN ('NEW', 'SCORED', 'SELECTED'))
    )
  RETURNING tc.*
), fallback AS (
  SELECT
    false AS success,
    CASE
      WHEN NOT EXISTS (SELECT 1 FROM candidate) THEN 'INVALID_CANDIDATE'
      WHEN $1 NOT IN ('promote', 'reject', 'duplicate') THEN 'INVALID_ACTION'
      WHEN $1 = 'promote' AND (SELECT status FROM candidate) NOT IN ('NEW', 'SCORED', 'SELECTED') THEN 'INVALID_SOURCE_STATUS'
      WHEN $1 = 'promote' THEN 'DUPLICATE_VIDEO_TOPIC'
      ELSE 'NOT_UPDATED'
    END AS result_code,
    409 AS response_status_code,
    (SELECT id FROM candidate) AS id,
    (SELECT status FROM candidate) AS status,
    (SELECT topic FROM candidate) AS topic,
    NULL::uuid AS promoted_topic_id
)
SELECT
  true AS success,
  CASE
    WHEN $1 = 'promote' THEN 'PROMOTED'
    WHEN $1 = 'reject' THEN 'REJECTED'
    WHEN $1 = 'duplicate' THEN 'DUPLICATE'
    ELSE 'UPDATED'
  END AS result_code,
  200 AS response_status_code,
  updated_candidate.id,
  updated_candidate.status,
  updated_candidate.topic,
  updated_candidate.promoted_topic_id
FROM updated_candidate
UNION ALL
SELECT * FROM fallback
WHERE NOT EXISTS (SELECT 1 FROM updated_candidate);
