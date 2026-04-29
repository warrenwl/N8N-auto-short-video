-- n8n Postgres node: Execute Query
-- Query parameters:
-- $1 = next_status        APPROVED, REJECTED, NEED_REVIEW, or SCRIPT_READY
-- $2 = review_status      APPROVED, REJECTED, NEED_REVIEW, or RERENDER_REQUESTED
-- $3 = review_note        optional, may be empty string
-- $4 = action_source      e.g. review_center
-- $5 = task_id
-- $6 = review_token
-- This query always returns one row, even if the update is blocked.
WITH updated AS (
  UPDATE video_topics
  SET
    status = $1,
    review_status = $2,
    review_note = NULLIF($3, ''),
    review_action_source = $4,
    reviewed_at = CASE WHEN $1 IN ('APPROVED', 'REJECTED') THEN now() ELSE reviewed_at END,
    approved_at = CASE WHEN $1 = 'APPROVED' THEN now() WHEN $1 IN ('NEED_REVIEW', 'SCRIPT_READY') THEN NULL ELSE approved_at END,
    rejected_at = CASE WHEN $1 = 'REJECTED' THEN now() WHEN $1 IN ('NEED_REVIEW', 'SCRIPT_READY') THEN NULL ELSE rejected_at END,
    render_started_at = CASE WHEN $1 = 'SCRIPT_READY' THEN NULL ELSE render_started_at END,
    render_finished_at = CASE WHEN $1 = 'SCRIPT_READY' THEN NULL ELSE render_finished_at END,
    media_started_at = CASE WHEN $1 = 'SCRIPT_READY' THEN NULL ELSE media_started_at END,
    media_finished_at = CASE WHEN $1 = 'SCRIPT_READY' THEN NULL ELSE media_finished_at END,
    audio_started_at = CASE WHEN $1 = 'SCRIPT_READY' THEN NULL ELSE audio_started_at END,
    audio_finished_at = CASE WHEN $1 = 'SCRIPT_READY' THEN NULL ELSE audio_finished_at END,
    error = NULL,
    updated_at = now()
  WHERE id = $5
    AND review_token = $6
    AND (
      ($1 IN ('APPROVED', 'REJECTED') AND status = 'NEED_REVIEW')
      OR ($1 = 'NEED_REVIEW' AND status IN ('APPROVED', 'REJECTED'))
      OR ($1 = 'SCRIPT_READY' AND status = 'REJECTED')
    )
  RETURNING
    true AS success,
    'UPDATED'::text AS result_code,
    id,
    title,
    status,
    review_status,
    review_note,
    video_path,
    cover_path,
    reviewed_at,
    approved_at,
    rejected_at
), existing AS (
  SELECT
    false AS success,
    CASE
      WHEN id IS NULL THEN 'INVALID_TASK_OR_TOKEN'
      WHEN $1 IN ('APPROVED', 'REJECTED') AND status <> 'NEED_REVIEW' THEN 'INVALID_SOURCE_STATUS'
      WHEN $1 = 'NEED_REVIEW' AND status NOT IN ('APPROVED', 'REJECTED') THEN 'INVALID_SOURCE_STATUS'
      WHEN $1 = 'SCRIPT_READY' AND status <> 'REJECTED' THEN 'INVALID_SOURCE_STATUS'
      ELSE 'NOT_UPDATED'
    END::text AS result_code,
    id,
    title,
    status,
    review_status,
    review_note,
    video_path,
    cover_path,
    reviewed_at,
    approved_at,
    rejected_at
  FROM video_topics
  WHERE id = $5
    AND review_token = $6
)
SELECT * FROM updated
UNION ALL
SELECT * FROM existing WHERE NOT EXISTS (SELECT 1 FROM updated)
UNION ALL
SELECT
  false AS success,
  'INVALID_TASK_OR_TOKEN'::text AS result_code,
  $5 AS id,
  NULL::text AS title,
  NULL::text AS status,
  NULL::text AS review_status,
  NULL::text AS review_note,
  NULL::text AS video_path,
  NULL::text AS cover_path,
  NULL::timestamp AS reviewed_at,
  NULL::timestamp AS approved_at,
  NULL::timestamp AS rejected_at
WHERE NOT EXISTS (SELECT 1 FROM updated) AND NOT EXISTS (SELECT 1 FROM existing);
