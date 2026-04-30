-- M5: Insert GLM-generated topic candidates.
-- $1 batch_id
-- $2 source_ref
-- $3 platform
-- $4 account_key
-- $5 category
-- $6 audience
-- $7 direction
-- $8 style
-- $9 candidates_json
-- $10 raw_payload_base_json

WITH input AS (
  SELECT
    NULLIF($1, '') AS batch_id,
    COALESCE(NULLIF($2, ''), 'glm:' || NULLIF($1, '')) AS source_ref,
    COALESCE(NULLIF($3, ''), 'douyin') AS platform,
    COALESCE(NULLIF($4, ''), 'mes') AS account_key,
    NULLIF($5, '') AS default_category,
    NULLIF($6, '') AS default_audience,
    NULLIF($7, '') AS direction,
    NULLIF($8, '') AS style,
    COALESCE(NULLIF($9, '')::jsonb, '[]'::jsonb) AS candidates_json,
    COALESCE(NULLIF($10, '')::jsonb, '{}'::jsonb) AS raw_payload_base
), candidates AS (
  SELECT
    row_number() OVER () AS ordinal,
    trim(value->>'topic') AS topic,
    NULLIF(trim(value->>'title'), '') AS title,
    NULLIF(trim(value->>'angle'), '') AS angle,
    NULLIF(trim(value->>'core_angle'), '') AS core_angle,
    COALESCE(NULLIF(trim(value->>'audience'), ''), (SELECT default_audience FROM input)) AS audience,
    COALESCE(NULLIF(trim(value->>'category'), ''), (SELECT default_category FROM input)) AS category,
    CASE
      WHEN jsonb_typeof(value->'tags') = 'array' THEN value->'tags'
      ELSE '[]'::jsonb
    END AS tags,
    value AS raw_candidate
  FROM input, jsonb_array_elements(input.candidates_json) AS value
  WHERE trim(value->>'topic') <> ''
), marked AS (
  SELECT
    c.*,
    existing.id AS duplicate_candidate_id
  FROM candidates c
  LEFT JOIN LATERAL (
    SELECT tc.id
    FROM topic_candidates tc
    JOIN input i ON true
    WHERE (
        lower(regexp_replace(tc.topic, '\s+', '', 'g')) = lower(regexp_replace(c.topic, '\s+', '', 'g'))
        OR (
          c.title IS NOT NULL
          AND NULLIF(tc.title, '') IS NOT NULL
          AND lower(regexp_replace(tc.title, '\s+', '', 'g')) = lower(regexp_replace(c.title, '\s+', '', 'g'))
        )
        OR (
          c.core_angle IS NOT NULL
          AND NULLIF(tc.raw_payload->'raw_candidate'->>'core_angle', '') IS NOT NULL
          AND lower(regexp_replace(tc.raw_payload->'raw_candidate'->>'core_angle', '\s+', '', 'g')) = lower(regexp_replace(c.core_angle, '\s+', '', 'g'))
        )
      )
      AND COALESCE(tc.account_key, '') = COALESCE(i.account_key, '')
      AND COALESCE(tc.category, '') = COALESCE(c.category, '')
      AND tc.status IN ('NEW', 'SCORED', 'SELECTED', 'PROMOTED')
    ORDER BY tc.updated_at DESC
    LIMIT 1
  ) existing ON true
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
    'glm',
    i.source_ref,
    'NEW',
    m.topic,
    m.title,
    m.angle,
    m.audience,
    i.platform,
    i.account_key,
    m.category,
    m.tags,
    i.raw_payload_base || jsonb_build_object(
      'candidate_ordinal', m.ordinal,
      'raw_candidate', m.raw_candidate,
      'direction', i.direction,
      'style', i.style
    ),
    NOW(),
    NOW()
  FROM marked m
  JOIN input i ON true
  WHERE m.duplicate_candidate_id IS NULL
  RETURNING id, topic
)
SELECT
  true AS success,
  'GLM_CANDIDATES_INSERTED'::text AS result_code,
  200 AS response_status_code,
  (SELECT batch_id FROM input) AS batch_id,
  (SELECT source_ref FROM input) AS source_ref,
  (SELECT count(*) FROM candidates) AS parsed_count,
  (SELECT count(*) FROM inserted) AS created_count,
  (SELECT count(*) FROM marked WHERE duplicate_candidate_id IS NOT NULL) AS duplicate_count,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'topic', topic) ORDER BY topic) FROM inserted), '[]'::jsonb) AS created_candidates;
